## Noir Contract Snapshots

`cargo insta` snapshot tests for noir contracts. Two test categories live here:

- **`expand/`** — runs `nargo expand` on a curated set of aztec-nr contracts (mirrors what CI benchmarks already exercise) and snapshots the expanded source. Surface for catching macro regressions that pass typechecking but silently change generated code.
- **`compile_failure/`** — drives `nargo compile` on intentionally invalid aztec-nr contracts and snapshots the full stderr. Locations inside the aztec-nr macro sources are scrubbed to `<line>`/`<col>` markers (like the `<repo>` path marker) so macro edits don't churn every snapshot; locations in the test program itself and in the stdlib are kept.

### Layout

```
Cargo.toml
build.rs                                    # generates one #[test] per case at build time
tests/
  snapshots.rs                              # run_compile_failure / run_expand helpers
  snapshots/
    compile_failure/<case>/*.snap           # committed
    expand/<case>/*.snap                    # committed
test_programs/
  compile_failure/<case>/{Nargo.toml,src/main.nr}
```

`expand` cases are *not* duplicated under `test_programs/`. They live in their canonical home under `noir-contracts/contracts/{app,test}/` and are referenced by relative path from `build.rs` (`EXPAND_CASES`).

### Prerequisites

`nargo` must be built. From the repo root:

```sh
(cd noir && ./bootstrap.sh)
```

By default the test harness looks for `nargo` at `../../noir/noir-repo/target/release/nargo`. Override with `NARGO=/path/to/nargo cargo test`.

### Running

```sh
cargo test                                  # run all snapshot tests
cargo test --test snapshots compile_failure # run one module
cargo test --test snapshots test_token      # run one test (substring match)
```

### Updating snapshots

Failing assertions write `.snap.new` siblings. Review them by reading the file, or use the review UI:

```sh
cargo insta review                          # interactive, recommended
cargo insta accept                          # accept all pending snapshots
cargo insta test --accept                   # run + accept in one step (needed
                                            # when the .snap doesn't exist yet)
```

CI rejects `INSTA_UPDATE`; any drift must be resolved locally and committed.

### Adding a case

`expand`: append `(name, relative_path)` to `EXPAND_CASES` in `build.rs`, then `cargo insta test --accept`.

`compile_failure`: drop a contract under `test_programs/compile_failure/<case>/` (`Nargo.toml` + `src/main.nr`), then `cargo insta test --accept`. Case directory names must use `_`, not `-`.
