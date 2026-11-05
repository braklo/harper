//! Harper as a spell-checking backend for KDE Sonnet.
//!
//! This crate is the Rust half of the Sonnet plugin in `plugin/`. It exposes a
//! small C ABI that the C++ `Sonnet::SpellerPlugin` calls word by word.
//!
//! The answers come from the same spell-check linter Harper runs everywhere
//! else (`SpellCheck`, `GermanSpellCheck`, `SlovakSpellCheck`, ...), so a word
//! is judged in KWrite exactly as in the browser extensions or `harper-ls`.
//!
//! Design constraints, all because the plugin lives inside every KDE
//! application that checks spelling:
//!
//! - Loading a dictionary takes seconds, so it happens on a background thread.
//!   Until it is ready every word counts as correct and nothing is underlined.
//! - Each language loads at most once per process, on first use.
//! - A panic must never cross into C++: every entry point catches it and
//!   answers "correct" / "no suggestions". The crate is built with
//!   `panic = "unwind"` for that reason (see `Cargo.toml`).
//! - Personal words go to the same file `harper-ls` uses
//!   (`~/.config/harper-ls/dictionary<suffix>.txt`), so Kate and the KDE
//!   applications share them.

use std::collections::{HashMap, HashSet};
use std::ffi::{CStr, c_char, c_int};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::path::PathBuf;
use std::sync::{Arc, LazyLock, Mutex};

use harper_core::language::{
    Language, dictionary, new_curated_for_language, parse_language, parser_for_prose,
};
use harper_core::linting::{LintKind, Linter, Suggestion};
use harper_core::parsers::{MarkdownOptions, Parser};
use harper_core::spell::{MergedDictionary, MutableDictionary};
use harper_core::{DictWordMetadata, Document, LintGroup};

/// Upper bound for the per-language verdict cache before it is cleared.
const CACHE_LIMIT: usize = 50_000;

/// Everything needed to check words of one language, built once per process.
struct Engine {
    parser: Box<dyn Parser>,
    dictionary: Arc<MergedDictionary>,
    linter: LintGroup,
}

/// `None` = the word is correct, `Some(suggestions)` = it is misspelled.
type Verdict = Option<Vec<String>>;

/// State shared by every speller of one language in this process.
struct Shared {
    language: Language,
    engine: Mutex<Option<Engine>>,
    /// Words added during this process (personal and session).
    extra_words: Mutex<HashSet<String>>,
    cache: Mutex<HashMap<String, Verdict>>,
}

/// Opaque handle given to C++.
pub struct HarperSpeller {
    shared: Arc<Shared>,
}

static SHARED: LazyLock<Mutex<HashMap<String, Arc<Shared>>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

/// The `harper-ls` user dictionary for a language, honouring
/// `HARPER_SONNET_USER_DICT` (base path, used by tests) and `XDG_CONFIG_HOME`.
fn user_dict_path(language: Language) -> Option<PathBuf> {
    let base = if let Some(p) = std::env::var_os("HARPER_SONNET_USER_DICT") {
        PathBuf::from(p)
    } else {
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .or_else(|| std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".config")))?;
        config.join("harper-ls").join("dictionary.txt")
    };

    // Same naming as `harper-ls` `Backend::dialect_path`.
    let suffix = language.family().dict_suffix();
    if suffix.is_empty() {
        return Some(base);
    }
    let stem = base.file_stem()?.to_string_lossy().into_owned();
    let name = match base.extension() {
        Some(ext) => format!("{stem}{suffix}.{}", ext.to_string_lossy()),
        None => format!("{stem}{suffix}"),
    };
    Some(base.with_file_name(name))
}

fn read_word_list(path: &PathBuf) -> Vec<String> {
    std::fs::read_to_string(path)
        .map(|s| {
            s.lines()
                .map(str::trim)
                .filter(|l| !l.is_empty())
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default()
}

fn build_engine(language: Language) -> Option<Engine> {
    let mut merged = MergedDictionary::new();
    merged.add_dictionary(dictionary(language));

    if let Some(path) = user_dict_path(language) {
        let words = read_word_list(&path);
        if !words.is_empty() {
            let mut user = MutableDictionary::new();
            let metadata = DictWordMetadata {
                dialects: language.dictionary_dialect_flags(),
                ..Default::default()
            };
            user.extend_words(
                words
                    .iter()
                    .map(|w| (w.chars().collect::<Vec<char>>(), metadata.clone())),
            );
            merged.add_dictionary(Arc::new(user));
        }
    }

    let dictionary = Arc::new(merged);
    let parser = parser_for_prose("plaintext", language, MarkdownOptions::default())?;

    let mut linter = new_curated_for_language(dictionary.clone(), language);
    linter.set_all_rules_to(Some(false));
    let spell_rules: Vec<String> = linter
        .iter_keys()
        .filter(|k| k.ends_with("SpellCheck"))
        .map(str::to_string)
        .collect();
    if spell_rules.is_empty() {
        eprintln!("harper-sonnet: no spell-check rule for {language:?}");
        return None;
    }
    for rule in spell_rules {
        linter.config.set_rule_enabled(rule, true);
    }

    Some(Engine {
        parser,
        dictionary,
        linter,
    })
}

impl Engine {
    fn check(&mut self, word: &str) -> Verdict {
        let document = Document::new(word, &self.parser, self.dictionary.as_ref());
        let lints: Vec<_> = self
            .linter
            .lint(&document)
            .into_iter()
            .filter(|l| l.lint_kind == LintKind::Spelling)
            .collect();
        if lints.is_empty() {
            return None;
        }

        let mut suggestions: Vec<String> = Vec::new();
        for lint in &lints {
            for suggestion in &lint.suggestions {
                if let Suggestion::ReplaceWith(chars) = suggestion {
                    // Sonnet replaces the whole word, so rebuild it with the
                    // lint's span replaced (the span may be part of the word).
                    let source: Vec<char> = word.chars().collect();
                    let start = lint.span.start.min(source.len());
                    let end = lint.span.end.min(source.len());
                    let mut fixed: String = source[..start].iter().collect();
                    fixed.extend(chars.iter());
                    fixed.extend(source[end..].iter());
                    if !suggestions.contains(&fixed) {
                        suggestions.push(fixed);
                    }
                }
            }
        }
        Some(suggestions)
    }
}

impl Shared {
    fn get_or_start(code: &str) -> Option<Arc<Shared>> {
        let language = parse_language(code)?;
        let key = code.to_ascii_lowercase().replace('-', "_");

        let mut all = SHARED.lock().ok()?;
        if let Some(existing) = all.get(&key) {
            return Some(existing.clone());
        }

        let shared = Arc::new(Shared {
            language,
            engine: Mutex::new(None),
            extra_words: Mutex::new(HashSet::new()),
            cache: Mutex::new(HashMap::new()),
        });
        all.insert(key.clone(), shared.clone());

        let loading = shared.clone();
        let started = std::thread::Builder::new()
            .name(format!("harper-sonnet-{key}"))
            .spawn(move || {
                let built = catch_unwind(|| build_engine(language)).unwrap_or_else(|_| {
                    eprintln!("harper-sonnet: loading {language:?} panicked");
                    None
                });
                if let (Some(engine), Ok(mut slot)) = (built, loading.engine.lock()) {
                    *slot = Some(engine);
                }
            });
        if started.is_err() {
            eprintln!("harper-sonnet: could not start the loader thread for {key}");
        }

        Some(shared)
    }

    fn is_ready(&self) -> bool {
        self.engine.lock().map(|e| e.is_some()).unwrap_or(false)
    }

    /// `None` while the dictionary is still loading (or failed to load).
    fn verdict(&self, word: &str) -> Option<Verdict> {
        if self
            .extra_words
            .lock()
            .map(|w| w.contains(word))
            .unwrap_or(false)
        {
            return Some(None);
        }
        if let Some(cached) = self.cache.lock().ok()?.get(word) {
            return Some(cached.clone());
        }

        let verdict = {
            let mut engine = self.engine.lock().ok()?;
            engine.as_mut()?.check(word)
        };

        if let Ok(mut cache) = self.cache.lock() {
            if cache.len() >= CACHE_LIMIT {
                cache.clear();
            }
            cache.insert(word.to_string(), verdict.clone());
        }
        Some(verdict)
    }

    fn add_word(&self, word: &str) {
        if let Ok(mut words) = self.extra_words.lock() {
            words.insert(word.to_string());
        }
        if let Ok(mut cache) = self.cache.lock() {
            cache.remove(word);
        }
    }

    /// Append the word to the shared `harper-ls` user dictionary, keeping its
    /// format (one word per line, sorted, as `save_dict` writes it).
    fn persist_word(&self, word: &str) -> bool {
        let Some(path) = user_dict_path(self.language) else {
            return false;
        };
        let mut words = read_word_list(&path);
        if words.iter().any(|w| w == word) {
            return true;
        }
        words.push(word.to_string());
        words.sort();
        let mut text = words.join("\n");
        text.push('\n');

        if let Some(parent) = path.parent()
            && std::fs::create_dir_all(parent).is_err()
        {
            return false;
        }
        // Write to a temporary file and rename, so a concurrent reader
        // (harper-ls in Kate) never sees a half-written list.
        let tmp = path.with_extension(format!("tmp-{}", std::process::id()));
        std::fs::write(&tmp, text).is_ok() && std::fs::rename(&tmp, &path).is_ok()
    }
}

/// Run `f`, turning a panic into `fallback`.
fn guarded<T>(fallback: T, f: impl FnOnce() -> T) -> T {
    catch_unwind(AssertUnwindSafe(f)).unwrap_or(fallback)
}

/// # Safety
/// `ptr` must point to `len` readable bytes (or be null with `len == 0`).
unsafe fn word_from<'a>(ptr: *const u8, len: usize) -> Option<&'a str> {
    if ptr.is_null() {
        return None;
    }
    let bytes = unsafe { std::slice::from_raw_parts(ptr, len) };
    std::str::from_utf8(bytes).ok()
}

/// Create a speller for a Sonnet language code such as `sk_SK`, `en_US` or
/// `de_DE`. Starts loading the dictionary in the background. Returns null for
/// an unsupported language.
///
/// # Safety
/// `language` must be a valid NUL-terminated string.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_new(language: *const c_char) -> *mut HarperSpeller {
    if language.is_null() {
        return std::ptr::null_mut();
    }
    let code = unsafe { CStr::from_ptr(language) }.to_string_lossy().into_owned();
    guarded(std::ptr::null_mut(), || match Shared::get_or_start(&code) {
        Some(shared) => Box::into_raw(Box::new(HarperSpeller { shared })),
        None => std::ptr::null_mut(),
    })
}

/// # Safety
/// `speller` must come from [`harper_sonnet_new`] and not be freed yet.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_free(speller: *mut HarperSpeller) {
    if !speller.is_null() {
        let _ = guarded((), || drop(unsafe { Box::from_raw(speller) }));
    }
}

/// 1 when the dictionary of this speller is loaded, 0 while it is loading.
///
/// # Safety
/// `speller` must be a live handle.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_is_ready(speller: *const HarperSpeller) -> c_int {
    let Some(speller) = (unsafe { speller.as_ref() }) else {
        return 0;
    };
    guarded(0, || c_int::from(speller.shared.is_ready()))
}

/// 1 = correct (also while loading or on any error), 0 = misspelled.
///
/// # Safety
/// `speller` must be a live handle; `word` must point to `len` bytes of UTF-8.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_is_correct(
    speller: *const HarperSpeller,
    word: *const u8,
    len: usize,
) -> c_int {
    let (Some(speller), Some(word)) = (unsafe { speller.as_ref() }, unsafe { word_from(word, len) })
    else {
        return 1;
    };
    guarded(1, || match speller.shared.verdict(word) {
        Some(Some(_)) => 0,
        _ => 1,
    })
}

/// Suggestions for a word as UTF-8, one per line, or null when there are
/// none. `out_len` receives the length in bytes. Free with
/// [`harper_sonnet_string_free`].
///
/// # Safety
/// `speller` must be a live handle; `word` must point to `len` bytes of UTF-8;
/// `out_len` must be writable.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_suggest(
    speller: *const HarperSpeller,
    word: *const u8,
    len: usize,
    out_len: *mut usize,
) -> *mut u8 {
    if out_len.is_null() {
        return std::ptr::null_mut();
    }
    unsafe { *out_len = 0 };
    let (Some(speller), Some(word)) = (unsafe { speller.as_ref() }, unsafe { word_from(word, len) })
    else {
        return std::ptr::null_mut();
    };
    let joined = guarded(None, || match speller.shared.verdict(word) {
        Some(Some(list)) if !list.is_empty() => Some(list.join("\n")),
        _ => None,
    });
    match joined {
        Some(text) => {
            let mut bytes = text.into_bytes().into_boxed_slice();
            unsafe { *out_len = bytes.len() };
            let ptr = bytes.as_mut_ptr();
            std::mem::forget(bytes);
            ptr
        }
        None => std::ptr::null_mut(),
    }
}

/// # Safety
/// `ptr` and `len` must come from one [`harper_sonnet_suggest`] call.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_string_free(ptr: *mut u8, len: usize) {
    if !ptr.is_null() {
        let _ = guarded((), || {
            drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(ptr, len)) })
        });
    }
}

/// Accept the word in this process and store it in the shared user dictionary.
/// Returns 1 on success.
///
/// # Safety
/// As for [`harper_sonnet_is_correct`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_add_personal(
    speller: *const HarperSpeller,
    word: *const u8,
    len: usize,
) -> c_int {
    let (Some(speller), Some(word)) = (unsafe { speller.as_ref() }, unsafe { word_from(word, len) })
    else {
        return 0;
    };
    guarded(0, || {
        speller.shared.add_word(word);
        c_int::from(speller.shared.persist_word(word))
    })
}

/// Accept the word for the rest of this process only. Returns 1 on success.
///
/// # Safety
/// As for [`harper_sonnet_is_correct`].
#[unsafe(no_mangle)]
pub unsafe extern "C" fn harper_sonnet_add_session(
    speller: *const HarperSpeller,
    word: *const u8,
    len: usize,
) -> c_int {
    let (Some(speller), Some(word)) = (unsafe { speller.as_ref() }, unsafe { word_from(word, len) })
    else {
        return 0;
    };
    guarded(0, || {
        speller.shared.add_word(word);
        1
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    fn ready(code: &str) -> Arc<Shared> {
        let shared = Shared::get_or_start(code).expect("supported language");
        let deadline = Instant::now() + Duration::from_secs(120);
        while !shared.is_ready() {
            assert!(Instant::now() < deadline, "{code} did not load");
            std::thread::sleep(Duration::from_millis(50));
        }
        shared
    }

    #[test]
    fn unsupported_language_gives_none() {
        assert!(Shared::get_or_start("xx_XX").is_none());
    }

    #[test]
    fn slovak_correct_and_misspelled() {
        let sk = ready("sk_SK");
        assert_eq!(sk.verdict("nezávisle"), Some(None));
        let wrong = sk.verdict("nezavisle").expect("loaded");
        let suggestions = wrong.expect("misspelled");
        assert!(suggestions.iter().any(|s| s == "nezávisle"), "{suggestions:?}");
    }

    #[test]
    fn slovak_capitalized_suggestion() {
        let sk = ready("sk_SK");
        let suggestions = sk.verdict("Nezavisle").unwrap().unwrap();
        assert!(suggestions.iter().any(|s| s == "Nezávisle"), "{suggestions:?}");
    }

    #[test]
    fn english_and_german() {
        let en = ready("en_US");
        assert_eq!(en.verdict("house"), Some(None));
        assert!(en.verdict("hous").unwrap().is_some());
        let de = ready("de_DE");
        assert_eq!(de.verdict("Haus"), Some(None));
        assert!(de.verdict("Hauss").unwrap().is_some());
    }

    #[test]
    fn session_word_is_accepted() {
        let sk = ready("sk_SK");
        assert!(sk.verdict("Qwzxyk").unwrap().is_some());
        sk.add_word("Qwzxyk");
        assert_eq!(sk.verdict("Qwzxyk"), Some(None));
    }
}
