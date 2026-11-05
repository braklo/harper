//! Slovak dictionary support.
//!
//! This module provides the Slovak dictionary implementation.
//! Uses Rune format dictionaries with annotations for comprehensive coverage.

use crate::spell::{FstDictionary, MutableDictionary, SuggestionHints};
use std::sync::{Arc, LazyLock};

fn load_slovak_annotated_dict() -> Arc<MutableDictionary> {
    MutableDictionary::from_rune_files(
        include_str!("../dictionary.dict"),
        include_str!("../annotations.json"),
    )
    .map(Arc::new)
    .unwrap_or_else(|e| panic!("Failed to load Slovak annotated dictionary: {}", e))
}

static SLOVAK_SUGGESTION_HINTS: LazyLock<SuggestionHints> = LazyLock::new(|| {
    SuggestionHints::from_annotations_json(include_str!("../annotations.json"))
        .unwrap_or_else(|e| panic!("Failed to read the Slovak suggestion hints: {}", e))
});

/// The suggestion hints (REP, MAP, KEY, TRY) imported from `sk_SK.aff` into the
/// `suggestions` section of `annotations.json`.
pub fn slovak_suggestion_hints() -> &'static SuggestionHints {
    &SLOVAK_SUGGESTION_HINTS
}

// New annotated dictionary using Rune format
static SLOVAK_ANNOTATED_DICT: LazyLock<Arc<MutableDictionary>> =
    LazyLock::new(load_slovak_annotated_dict);

/// Returns a shared reference to the original Slovak FstDictionary.
///
/// The dictionary is loaded and built once on first access, then cached for the
/// lifetime of the process. This provides fuzzy matching, prefix search, and
/// all other `Dictionary` trait capabilities.
pub fn slovak_dictionary() -> Arc<FstDictionary> {
    // Convert the annotated mutable dictionary to FST format
    Arc::new((**SLOVAK_ANNOTATED_DICT).clone().into())
}

/// Returns the main curated Slovak dictionary.
///
/// This uses the annotated dictionary which includes morphological annotations
/// for grammar analysis.
pub fn curated_slovak_dictionary() -> Arc<FstDictionary> {
    slovak_dictionary()
}

/// Returns the mutable Slovak dictionary for annotation processing.
///
/// This is primarily used internally for annotation-based grammar checking.
pub fn mutable_slovak_dictionary() -> Arc<MutableDictionary> {
    (*SLOVAK_ANNOTATED_DICT).clone()
}
