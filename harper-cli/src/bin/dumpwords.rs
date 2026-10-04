use harper_core::spell::{FstDictionary, Dictionary};
use std::io::{BufWriter, Write};
fn main() {
    let d = FstDictionary::curated();
    let out = std::io::stdout();
    let mut w = BufWriter::new(out.lock());
    let mut n = 0usize;
    for word in d.words_iter() {
        let s: String = word.iter().collect();
        writeln!(w, "{}", s).unwrap();
        n += 1;
    }
    w.flush().unwrap();
    eprintln!("dumped {} words", n);
}
