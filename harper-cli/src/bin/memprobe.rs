//! memprobe — how much RAM does Harper's curated dictionary actually cost?
//!
//! Reports the resident set size after each loading stage, so the cost can be split into
//! `MutableDictionary` (the hash map of words + metadata) and the extra that `FstDictionary`
//! adds on top. `malloc_trim` is called between the stages to tell *live* data apart from
//! freed-but-retained heap (glibc does not return freed blocks to the OS by itself).
//!
//! Always measure a RELEASE build.

use std::hint::black_box;
use std::time::Instant;

use harper_core::spell::{Dictionary, FstDictionary, MutableDictionary};
use harper_core::{CharString, DictWordMetadata};

// glibc: return free heap blocks to the OS.
unsafe extern "C" {
    fn malloc_trim(pad: usize) -> i32;
}

/// Read a `/proc/self/status` field in kB.
fn proc_status_kb(field: &str) -> Option<u64> {
    let status = std::fs::read_to_string("/proc/self/status").ok()?;
    for line in status.lines() {
        if let Some(rest) = line.strip_prefix(field) {
            let rest = rest.trim_start_matches(':').trim();
            let num = rest.split_whitespace().next()?;
            return num.parse().ok();
        }
    }
    None
}

fn rss_kb() -> u64 {
    proc_status_kb("VmRSS").unwrap_or(0)
}

fn report(stage: &str) -> u64 {
    let rss = rss_kb();
    let hwm = proc_status_kb("VmHWM").unwrap_or(0);
    println!(
        "{stage}: VmRSS = {} kB ({:.1} MB) · VmHWM = {} kB ({:.1} MB)",
        rss,
        rss as f64 / 1024.0,
        hwm,
        hwm as f64 / 1024.0
    );
    rss
}

fn trim() {
    unsafe {
        malloc_trim(0);
    }
}

fn main() {
    println!(
        "size_of: DictWordMetadata = {} B · CharString = {} B",
        std::mem::size_of::<DictWordMetadata>(),
        std::mem::size_of::<CharString>()
    );

    let base = report("baseline (pred načítaním)");

    // Stage 1: the mutable dictionary (hash map of words → metadata).
    let start = Instant::now();
    let md = MutableDictionary::curated();
    let load_md = start.elapsed();
    let words = md.word_count();
    println!("word_count: {words}");
    println!("load_time (MutableDictionary): {:.3} s", load_md.as_secs_f64());
    let after_md = report("po MutableDictionary");
    trim();
    let after_md_trim = report("po MutableDictionary + malloc_trim");

    // Stage 2: the FST on top of it.
    let start = Instant::now();
    let d = FstDictionary::curated();
    let load_fst = start.elapsed();
    println!("load_time (FstDictionary): {:.3} s", load_fst.as_secs_f64());
    println!("contains 'dom': {}", d.contains_word_str("dom"));
    println!("contains 'ženy': {}", d.contains_word_str("ženy"));
    println!("contains 'the': {}", d.contains_word_str("the"));
    let after_fst = report("po FstDictionary");
    trim();
    let after_fst_trim = report("po FstDictionary + malloc_trim");

    if words > 0 {
        let per = |kb: u64| (kb.saturating_sub(base) as f64 * 1024.0) / words as f64;
        println!(
            "B/tvar — MutableDictionary: {:.1} · +FST: {:.1} · po trim: {:.1}",
            per(after_md_trim),
            per(after_fst),
            per(after_fst_trim)
        );
        println!(
            "freed-but-retained heap: MutableDictionary {:.1} MB · celkovo {:.1} MB",
            (after_md.saturating_sub(after_md_trim)) as f64 / 1024.0,
            (after_fst.saturating_sub(after_fst_trim)) as f64 / 1024.0
        );
    }

    black_box((&md, &d));
}
