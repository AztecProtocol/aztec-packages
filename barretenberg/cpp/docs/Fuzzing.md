# Fuzzing barretenberg

## Intro

We are gradually introducing fuzzing of various primitives into barretenberg, focusing first and foremost on in-circuit types. If you are developing / patching a primitive and there is a fuzzer available for it, please take the time to update the fuzzer (if you've added new functionality) and run it for at least a few hours to increase security.


## Available fuzzers

Barretenberg includes fuzzing targets for a wide range of components:

### stdlib

#### primitives
- bigfield
- cycle_group
- biggroup
  - biggroup_bn254
  - biggroup_bn254_bigfield
  - biggroup_secp256k1
  - biggroup_secp256r1
- safe_uint
- field
- byte_array
- bool

#### Encryption and hash
- aes128
- blake2s
- blake3s
- keccak
- sha256
- poseidon2
- pedersen

### Other systems
- ACIR DSL fuzzer
- Translator VM fuzzers
   - mini
   - composer
   - circuit_builder
- IPA fuzzer
- ECC multi-field fuzzer
- AVM fuzzers
   - ALU harness
- ECCVM fuzzer

To build all fuzzers:

```bash
cmake --preset fuzzing && cmake --build ./build-fuzzing
```

For AVM-specific fuzzers:

```bash
cmake --preset fuzzing-avm && cmake --build ./build-fuzzing-avm
```

## Running the fuzzer

This section covers direct invocation of fuzzers without Docker.

### Basic use

Run a fuzzer binary directly:

```bash
./bin/stdlib_primitives_bigfield_ultra_fuzzer
```

Useful when you've modified logic or added new instructions and want a quick sanity check.

### Recommended configuration for serious fuzzing

```bash
mkdir ../../../<fuzzer_type>_testcases
mkdir crashes

./bin/<fuzzer_executable> \
  -timeout=1 \
  -len_control=500 \
  -workers=8 \
  -jobs=8 \
  -entropic=1 \
  -shrink=1 \
  -artifact_prefix=crashes/ \
  -use_value_profile=1 \
  ../../../<fuzzer_type>_testcases
```

You can watch the progress of the fuzzer in one of the generated logs fuzz-<number>.log
The purpose of each parameter:

- -timeout=1 - If a testcase takes more than 1 second to execute, it will be treated as a crash
- -len_control=500 - Slows down the increase of testcase size. Especially important for heavy classes like bigfield, keeps the number of executions per second at a decent rate
- -workers=8 - The number of threads that can simultaneously execute testcases. Should be less or equal to the number of jobs
- -jobs=8 - After how many crashes the fuzzer will stop fuzzing. If a crash is executed and the number of jobs is more than workers then the fuzzer will proceed to give the worker a new job. The 8/8 worker/job configuration ensures that the fuzzer will quit after 8 crashes and until the first crash all the workers are busy.
- -entropic=1 - Entropic should be enabled by default, but in case it isn't, enable it. A better power schedule than the old one.
- -shrink=1 - If a new testcase is encountered that has the same coverage as some previous one in the corpus and the testcase is smaller, replace the one in the corpus with the new one. Helps keep exec/s higher.
- -artifact_prefix=crashes/ - Where to save crashes/timeouts/ooms.
- -use_value_profile=1 - Leverage libfuzzer internal CMP analysis. Very useful, but blows the corpus up.
- <PATH_TO_CORPUS> (`../../../<fuzzer_type>_testcases`) - The path to the folder, where corpus testcases are going to be saved and loaded from (also loads testcases from there at the start of fuzzing).

Log structure is described here https://llvm.org/docs/LibFuzzer.html

### Corpus minimization

If you've found an issue, stopped the fuzzer, you can minimize the corpus to get rid of repetitions and then start from a minimized corpus

```bash
mkdir ../../../<fuzzer_type>_testcases_minimized
./bin/<fuzzer_executable> \
  -merge=1 \
  -use_value_profile=1 \
  ../../../<fuzzer_type>_testcases_minimized \
  ../../../<fuzzer_type>_testcases

rm  ../../../<fuzzer_type>_testcases/*;
cp ../../../<fuzzer_type>_testcases_minimized/* ../../../<fuzzer_type>_testcases;
```

### Crash minimization

If you've found a crash, you can minimize the crash to make the root cause more obvious:

```bash
mkdir minimized_crashes
./bin/<fuzzer_executable> \
  -minimize_crash=1 \
  -artifact_prefix=minimized_crashes \
  <crash_file>
```

### Debugging helpers

Most of the fuzzers contain the `FUZZING_SHOW_INFORMATION` preprocessor cases, which enable the printing of instructions and values to make debugging the crash easier. It can be either enabled using `-DFUZZING_SHOW_INFORMATION` or building with `fuzzing-asan` preset.

### Building fuzzers manually

To build with standard clang:

```bash
sudo apt-get install libclang-rt-18-dev
cmake --preset fuzzing
cmake --build ./build-fuzzing
```

Fuzzing build turns off building tests and benchmarks, since they are incompatible with libfuzzer interface.

### ASan / UBSan builds

AddressSanitizer:

```bash
cmake --preset fuzzing-asan
```
Sometimes you might have to specify the address of llvm-symbolizer. You have to do it with `export ASAN_SYMBOLIZER_PATH=<PATH_TO_SYMBOLIZER>`.

Note that address sanitizer can be used to explore crashes


UndefinedBehaviorSanitizer:

```bash
cmake --preset ubsan -DFUZZING=ON
```

#### Note

Sanitizers slow the fuzzers heavily (ASan ~2-3x slower, UBSan too).
Best practice:
   - run non-sanitized first
   - minimize corpus
   - rerun under ASan/UBSan for a bit for deeper checking


### Custom clang versions

To set up cmake with another version of clang and fuzzing on:

```bash
cmake \
  -DCMAKE_BUILD_TYPE=RelWithDebInfo \
  -DCMAKE_C_COMPILER=<path to clang> \
  -DCMAKE_CXX_COMPILER=<path to clang++> \
  -DFUZZING=ON \
  ..
```

## Coverage reports

### Build

Build with coverage instrumentation:

```bash
cmake --preset clang20-coverage -DFUZZING=ON
cmake --build --preset clang20-coverage
```

or

```bash
cmake --preset fuzzing-coverage
cmake --build ./build-fuzzing-cov
```

### Generate coverage

Run the fuzzer on the corpus and generate the HTML coverage reports:

```
LLVM_PROFILE_FILE="coverage.profraw" \
  ./bin/<fuzzer> corpus/ -runs=1

llvm-profdata merge -sparse coverage.profraw -o coverage.profdata

llvm-cov show \
  -output-dir=out/report \
  -format=html \
  ./bin/<fuzzer> \
  -instr-profile=coverage.profdata
```

For expanded output:

```
llvm-cov show <fuzzing_binary> \
     -instr-profile=coverage.profdata \
     -format=html \
     -output-dir=out/report \
     -show-line-counts-or-regions \
     --show-branches=percent \
     --show-directory-coverage
```

## View report

```
python3 -m http.server --directory out/
```
