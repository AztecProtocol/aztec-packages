# AVM <> Brillig fuzzing

Coverage based fuzzing AVM vs Brillig based on [ssa_fuzzer](https://github.com/noir-lang/noir/tree/master/tooling/ssa_fuzzer)

# Requirements
1) A foundation (aztec-packages) checkout: the fuzzer is a crate inside noir's source tree (`tooling/ssa_fuzzer`), and the `avm-transpiler` binary must be built there against that same noir version. This repo provides only the simulator half of the loop.
2) Cargo Fuzz: `cargo install cargo-fuzz`
3) Rust Nightly compiler: `rustup install nightly`

## Overview
How fuzz loop looks like:
1) Fuzzer generates Noir [SSA](https://en.wikipedia.org/wiki/Static_single-assignment_form), compiles it into Brillig bytecode and executes it
2) Fuzzer gets bytecode of the program (1) and transpiles it with `avm_transpiler`
3) Fuzzer simulates bytecode with `avm_simulator_bin.ts` with the AVM bytecode(2) and the same inputs (1)
4) Fuzzer compares the results. If the results disagree (brillig XOR avm failed, brillig_outputs != avm_outputs) this is probably a bug.

## Setup
1) In the foundation checkout, build `avm_transpiler` (`avm-transpiler/bootstrap.sh`)
2) Build `avm_simulator_bin` in this repo: it compiles with the simulator package (`yarn build:fuzzer` from `yarn-project/simulator`, output at `dest/public/fuzzing/avm_simulator_bin.js`)
3) Run `scripts/run_avm_brilling_fuzz.sh` with `AZTEC_TOOLCHAIN_FND_ROOT` pointing at the foundation checkout (or `--noir-path`/`--transpiler-path` set explicitly), or invoke the fuzzer by hand from `$NOIR/tooling/ssa_fuzzer/fuzzer`:
```bash
SIMULATOR_BIN_PATH=$ABSOLUTE_PATH_TO_AVM_SIMULATOR_BIN_JS TRANSPILER_BIN_PATH=$ABSOLUTE_PATH_TO_TRANSPILER_BIN cargo +nightly fuzz run --fuzz-dir . brillig   -- -max_len=10000
```
