# AVM <> Brillig fuzzing

Coverage based fuzzing AVM vs Brillig based on [ssa_fuzzer](https://github.com/noir-lang/noir/tree/master/tooling/ssa_fuzzer)

## Overview
How fuzz loop looks like:
1) Fuzzer generates Noir [SSA](https://en.wikipedia.org/wiki/Static_single-assignment_form), compiles it into Brillig bytecode and executes it
2) Fuzzer gets bytecode of the program (1) and transpiles it with `avm_transpiler`
3) Fuzzer simulates bytecode with `avm_simulator_bin.ts` with the AVM bytecode(2) and the same inputs (1)
4) Fuzzer compares the results. If the results disagree (brillig XOR avm failed, brillig_outputs != avm_outputs) this is probably a bug.

## Setup
Compile `avm_simulator_bin`
```bash
tsc scripts/fuzzing/avm_simulator_bin.ts --outDir dest/scripts/fuzzing --module commonjs --target es2022 --esModuleInterop --allowSyntheticDefaultImports --resolveJsonModule --skipLibCheck
mv dest/scripts/fuzzing/avm_simulator_bin.js dest/scripts/fuzzing/avm_simulator_bin.cjs
```

1) Build `avm_transpiler` with the same version of Noir as the fuzzer running
2) Build `avm_simulator_bin`
3) Go to the `$NOIR/tooling/ssa_fuzzer/fuzzer` and run
```bash
SIMULATOR_BIN_PATH=$ABSOLUTE_PATH_TO_AVM_SIMULATOR_BIN_JS TRANSPILER_BIN_PATH=$ABSOLUTE_PATH_TO_TRANSPILER_BIN cargo +nightly fuzz run --fuzz-dir . brillig   -- -max_len=10000
```
