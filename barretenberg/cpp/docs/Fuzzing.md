# Fuzzing barretenberg

## Intro

If you change a primitive that has a fuzzer, update the fuzzer (if you've added new functionality) and run it for at least a few hours.


## Available fuzzers

Fuzzers are the `*.fuzzer.cpp` files under `src/`. Each builds into a binary named `<module>_<file stem>_fuzzer` (`cmake/module.cmake`), e.g. `stdlib_primitives_bigfield_ultra_fuzzer`. After a fuzzing build, list them with `ls build-fuzzing/bin/*_fuzzer`; the build also writes `build-fuzzing/fuzzer_entries.txt`. They cover stdlib primitives and hashes, the ACIR DSL, Translator, IPA, ECC, ECCVM and the AVM.

To build all fuzzers (the `fuzzing` preset uses `clang-20`; on Ubuntu install `libclang-rt-20-dev`):

```bash
cmake --preset fuzzing && cmake --build ./build-fuzzing
```

The fuzzing build turns off building tests and benchmarks, since they are incompatible with the libfuzzer interface.

For AVM-specific fuzzers:

```bash
cmake --preset fuzzing-avm && cmake --build ./build-fuzzing-avm
```

## Running the fuzzer

### Basic use

libFuzzer runs until it finds a crash, on every worker you give it. Always bound a run with `-max_total_time=<seconds>` (or `-runs=<n>`). On a shared host, also prefix it with `nice -n 19` and keep `-workers` low.

Run a fuzzer binary directly, from `build-fuzzing`:

```bash
./bin/stdlib_primitives_bigfield_ultra_fuzzer -max_total_time=60
```

Useful when you've modified logic or added new instructions and want a quick sanity check.

### Recommended configuration for serious fuzzing

```bash
mkdir ../../../<fuzzer_type>_testcases
mkdir crashes

./bin/<fuzzer_executable> \
  -max_total_time=<seconds> \
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

- -max_total_time=<seconds> - Stop after this many seconds.
- -timeout=1 - If a testcase takes more than 1 second to execute, it will be treated as a crash
- -len_control=500 - Slows down the increase of testcase size. Especially important for heavy classes like bigfield, keeps the number of executions per second at a decent rate
- -workers=8 - The number of threads that can simultaneously execute testcases. Should be less or equal to the number of jobs
- -jobs=8 - Run 8 fuzzing jobs; each job ends at its first crash. When a job ends and more jobs remain than workers, the freed worker starts a new job. With `-workers=8`, all 8 jobs run in parallel and the run stops after 8 crashes.
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
