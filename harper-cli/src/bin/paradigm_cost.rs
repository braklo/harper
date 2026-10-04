//! paradigm_cost — for every entry of a Rune word list, count how many word forms it
//! expands into on its own.
//!
//! This is the *cost* side of the knapsack cut: how much RAM one dictionary stem buys.
//! It deliberately goes through Harper's own expansion (`MutableDictionary::from_rune_files`)
//! rather than re-implementing hunspell semantics, so the numbers match the shipped artifact.
//!
//! Usage: paradigm_cost <dictionary.dict> <annotations.json> > costs.tsv
//! Output: <stem>\t<flags>\t<forms>

use std::io::{BufWriter, Write};

use harper_core::spell::{Dictionary, MutableDictionary};
use rayon::prelude::*;

fn main() {
    let mut args = std::env::args().skip(1);
    let dict_path = args.next().expect("usage: paradigm_cost <dict> <annotations>");
    let attr_path = args.next().expect("usage: paradigm_cost <dict> <annotations>");

    let dict_src = std::fs::read_to_string(&dict_path).expect("cannot read word list");
    let attr_src = std::fs::read_to_string(&attr_path).expect("cannot read annotations");

    // Same filtering as `parse_word_list`: skip the count line, blank lines and comments.
    let entries: Vec<&str> = dict_src
        .lines()
        .skip(1)
        .filter(|l| !l.is_empty() && !l.starts_with('#'))
        .map(|l| match l.split_once('#') {
            Some((entry, _comment)) => entry.trim_end(),
            None => l.trim_end(),
        })
        .filter(|l| !l.is_empty())
        .collect();

    eprintln!("entries: {}", entries.len());

    let rows: Vec<(String, String, usize)> = entries
        .par_iter()
        .map(|entry| {
            let (word, flags) = match entry.split_once('/') {
                Some((w, f)) => (w, f),
                None => (*entry, ""),
            };
            let one = format!("1\n{entry}\n");
            let forms = MutableDictionary::from_rune_files(&one, &attr_src)
                .map(|d| d.word_count())
                .unwrap_or(0);
            (word.to_string(), flags.to_string(), forms)
        })
        .collect();

    let stdout = std::io::stdout();
    let mut out = BufWriter::new(stdout.lock());
    let mut total = 0usize;
    for (word, flags, forms) in &rows {
        writeln!(out, "{word}\t{flags}\t{forms}").unwrap();
        total += forms;
    }
    out.flush().unwrap();
    eprintln!("sum of per-stem forms: {total}");
}
