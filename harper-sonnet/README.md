# harper-sonnet

Harper as a spell-checking backend ("client") for KDE Sonnet, so KWrite, KMail,
Konsole and the Qt text fields of KDE applications check spelling with the same
engine as the Harper browser extensions and `harper-ls`.

- `src/lib.rs`: Rust core with a C ABI. Runs the language's Harper spell-check
  linter on one word. Languages: Slovak, English (US/GB/CA/AU/IN), German
  (DE/AT/CH); each loads on a background thread at first use, once per process.
  Personal words go to the `harper-ls` user dictionary
  (`~/.config/harper-ls/dictionary<suffix>.txt`).
- `plugin/`: the C++/Qt Sonnet plugin (`sonnet_harper.so`) and a smoke test.

Sonnet only asks about single words, so this gives spelling, not grammar.

## Build

```sh
cargo build --release                      # own workspace, panic = "unwind"
cmake -S plugin -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
HARPER_SONNET_USER_DICT=$(mktemp -d)/dictionary.txt ./build/plugintest "$PWD/build/sonnet_harper.so"
```

## Use

Copy `build/sonnet_harper.so` to `<dir>/kf6/sonnet/`, put `<dir>` into
`QT_PLUGIN_PATH` for the Plasma session, and select the backend in
`~/.config/KDE/Sonnet.conf`:

```ini
[General]
defaultClient=Harper
```

Without that line Sonnet keeps preferring Hunspell (reliability 30 < 40).

## Caveats

- Every application that checks spelling loads its own copy of the
  dictionaries (Slovak ≈ 400 MB). A shared service is the planned fix.
- `plugin/sonnet/` holds private Sonnet headers from v6.31.0; recheck them
  after a KDE Frameworks upgrade.
