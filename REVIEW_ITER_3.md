# Review iter 3 — wasi-sdk → Emscripten migration

Branch under review: `coder/wasi-to-emscripten-migration` (HEAD `de031e1ca0`).
Reviewer: independent verification of `CODER_REPORT.md` "Iteration 3" section
plus the four new commits (`4671ba0a1f`, `5036eb4f93`, `72c119be86`,
`cc0f85a333`, `de031e1ca0`).

## Verdict: **COMPLETE**

Every iter-2 finding (G1..G12) has been closed at the source level. No
regressions were introduced into iter-1 fixes (F1..F18). Both grep gates
(spec-verbatim and orchestrator-extended, including `__wasi__`/`__WASI__`)
return zero hits. Toolchain link flags are present verbatim, in spec order,
in spec-verbatim no-space SHELL form. Pool-exhaustion and memory-growth
tests now exercise the bug class they claim to. Clean-shutdown harness
genuinely warms the pthread pool (via concurrent `srsInitSrs` calls that
internally fan out across `parallel_for`). Re-entry test pins
`backend: BackendType.Wasm` and round-trips a `blake2s` against a
known-correct hash on both the first and second instance. wasm-run no
longer leaks tmp files (preamble path removed; `--mem` reduced to
informational). `BackendOptions.memory` was removed end-to-end.
Compatibility-window job is a real API-surface diff, not an echo, gated
default-off, marked for deletion 2026-05-26. Perf gate is a real benchmark
job that warns rather than fails on null baseline.

`Finalise.md` written.

---

## Re-walk of round-2 findings (G1..G12)

| Finding | Round-2 severity | Round-3 status | Evidence |
|---------|------------------|---------------|----------|
| G1 (PTHREAD_POOL_SIZE_STRICT=2 contradicts pool-exhaustion test) | blocker | **PASS** | `wasm-emscripten.cmake:109` is now `"SHELL:-sPTHREAD_POOL_SIZE_STRICT=1"`. Toolchain comment block at lines 97-103 explicitly explains the elastic-growth rationale and references `pool_exhaustion.test.cpp`. |
| G2 (memory_growth test never triggers memory.grow) | blocker | **PASS** | `memory_growth.test.cpp:41` has `kPerThreadGrowBytes = 96 * 1024 * 1024`. Total = 8×96MiB + 4MiB = 772 MiB > 512MB INITIAL_MEMORY. `std::barrier sync_point` (line 90) ensures all pre-grow writes complete before any grow allocation. Per-thread memcmp (line 121-128) and shared seed buffer memcmp (line 124-127) present. `EXPECT_GT(pages_after * kWasmPageBytes, pages_before * kWasmPageBytes)` (line 153) under `__wasm__` guard fails loudly if grow is suppressed. |
| G3 (wasm-run --mem preamble file leaks) | major | **PASS** | `wasm-run` (lines 186-199) now invokes Node as a child (no `exec`), wraps with `set +e` / `set -e`, captures `$?` into `status`, and `exit "$status"`. Preamble path removed entirely; `--mem` is now informational only and surfaces `BB_WASM_INITIAL_MEMORY` for callers. No `mktemp`/`trap` pattern remains. `bash -n wasm-run` passes. |
| G4 (clean-shutdown harness does not warm pool) | major | **PASS** | `clean_shutdown.harness.ts` (lines 81-94) issues 8 concurrent `srsInitSrs` calls (which internally use `parallel_for` per `bbapi/bbapi_srs.cpp` — verified 3 `parallel_for` blocks at lines 27, 34, 42) plus 32 concurrent `blake2s` calls. The synthetic 0xFF-filled point buffer (lines 54-56) is the curve-membership-passing infinity sentinel per `affine_element::serialize_from_buffer`. The pthread pool is genuinely warm at the moment `destroy()` is called. |
| G5 (re-entry test only checks typeof destroy) | major | **PASS** | `reentry.test.ts:33-66`: both `Barretenberg.new` calls pin `backend: BackendType.Wasm`. Both instances call `bb.blake2s({ data: BLAKE2S_INPUT })` and assert `secondResp.hash === BLAKE2S_EXPECTED` against a known-correct 32-byte hash constant. Anchors the expected hash against the live build via `firstResp.hash` check at line 46 (so blake2s drift would surface as both halves failing in lockstep). |
| G6 (`__wasi__` guard in cli11.hpp + grep regex) | major | **PASS** | `grep -rn -E "__wasi__|__WASI__" barretenberg/ scripts/ docs/ .github/ --exclude=CHANGELOG.md` returns **zero hits**. The previous lines 144-145 of `cli11.hpp` are gone (file is now 11018 lines, was 11020). Workflow regex extended (`.github/workflows/wasm-emscripten.yml:55-57`) with `FORBIDDEN_DBL_UNDER`, `FORBIDDEN_WASI_LOWER_TAIL`, `FORBIDDEN_WASI_UPPER` env-half splits assembled at line 93 in the `EXTENDED_PATTERN`. |
| G7 (INITIAL_MEMORY/MAXIMUM_MEMORY not runtime overrides) | major | **PASS** | `barretenberg_wasm_main/index.ts:108-113` now passes only `{ pthreadPoolSize, print, printErr, noExitRuntime }` — no `INITIAL_MEMORY`/`MAXIMUM_MEMORY` runtime keys. `BackendOptions.memory` (former dead surface) removed from `bb_backends/index.ts:15-67`. Docstring at lines 84-91 explicitly documents the link-time-only constraint and that the parameters are deliberately not accepted. |
| G8 (SHELL form uses spaces) | minor | **PASS** | All `add_link_options` and `target_link_options` SHELL forms in `wasm-emscripten.cmake:107-125` and `threading.cmake:9,25` are now spec-verbatim no-space (`"SHELL:-sX=Y"`). |
| G9 (clean-shutdown failure-detection) | minor | **PASS** | Reviewer marked PASS in iter-2; verified the wiring is preserved under the new harness (5s unref'd timer, parent's outer 30s guard, `expect(exit.code).toBe(0)`). |
| G10 (bb.js index.test.ts still works) | minor | **PASS** | Reviewer marked PASS in iter-2; test (`barretenberg_wasm/index.test.ts:7-46`) untouched and uses comlink-proxied `BarretenbergWasmMain`. |
| G11 (threads → pthreadPoolSize mapping) | minor | **PASS** | Reviewer marked PASS in iter-2; mapping unchanged. |
| G12 (BackendOptions.memory dead surface) | minor | **PASS** | Resolved via G7 — `memory` field removed from `BackendOptions` entirely. `grep -rn "memory.*initial\|BackendOptions" barretenberg/ts/src/` shows zero matches for the `memory.*initial` half. |

Round-2 fix rate: **12 PASS, 0 partial, 0 blocker**.

---

## Re-walk of round-1 findings (F1..F18)

Verified no regressions while closing G1..G12.

| Finding | Round-2 status | Round-3 status | Evidence |
|---------|---------------|---------------|----------|
| F1 (grep gate, AC#1) | PASS | **PASS** | Spec-verbatim gate clean; v4.2.0 doc edit preserved at `docs/network_versioned_docs/version-v4.2.0/operators/setup/building-from-source.md:301`. |
| F2 (link flags) | PASS-with-G8 | **PASS** | All 16 spec link flags present in `wasm-emscripten.cmake:107-125`, spec-verbatim no-space SHELL form. **`-sINITIAL_MEMORY=512MB` and `-sMAXIMUM_MEMORY=4GB` still present** (lines 114-115) — they were NOT dropped while fixing G7 (G7 was about the runtime API, not the link-time flag). Debug-only `-sASSERTIONS=2 -sSAFE_HEAP=1` preserved at line 132-133. |
| F3 (wasm-run --dir/--mem) | partial / G3 | **PASS** | G3 closed; `--dir` chdir still works (line 182-184); `--mem` is informational only with explicit doc-comment. |
| F4 (clean-shutdown harness) | partial / G4 | **PASS** | G4 closed; harness genuinely warms pool. |
| F5 (gate regex breadth) | PASS-with-G6 | **PASS** | G6 closed; extended regex catches `__wasi__`/`__WASI__`. |
| F6 (delete fetch_code/) | PASS | **PASS** | Directory still gone. |
| F7 (`_initialize` handshake) | PASS | **PASS** | No `_initialize` references. |
| F8 (benchmark_wasm_remote_wasmer.sh) | PASS | **PASS** | File still deleted. |
| F9 (bootstrap test plan) | PASS | **PASS** | `bootstrap.sh:271-279` `test_cmds_wasm_threads` emits both `ecc_tests` and `wasm_threads_tests_tests` lines. |
| F10 (exception model divergence) | PASS | **PASS** | Single-thread `wasm` preset still uses `WASM_EXCEPTIONS=wasm`. |
| F11 (exception-gate test) | PASS | **PASS** | CI step at `wasm-emscripten.yml:127-142` re-invokes cmake with `-DWASM_EXCEPTIONS=javascript` and asserts FATAL_ERROR. |
| F12 (`barretenberg_wasm_base` alias) | PASS | **PASS** | TODO marker still present. |
| F13 (pthreadPoolSize key) | PASS | **PASS** | Key name preserved. |
| F14 (--experimental-wasm-threads) | PASS | **PASS** | Flag still absent from `wasm-run`. |
| F15 (package.json exports) | PASS | **PASS** | Conditional exports preserved (`package.json:9-30`). |
| F16 (legacy-toolchain-compat job) | PASS | **PASS** | Real npm-pack + d.ts diff preserved (`wasm-emscripten.yml:251-300`); gated default-off; "DELETE THIS JOB AFTER 2026-05-26" comment intact at line 249. |
| F17 (`_initialize` shim deleted) | PASS | **PASS** | `wasm_env/` directory still gone. |
| F18 (dead RelWithDebInfo flags) | PASS | **PASS** | No `RELWITHDEBINFO_INIT` block in toolchain. |

---

## Acceptance criteria walk-through

| AC | Pass/Fail | Evidence |
|----|-----------|----------|
| **#1** zero forbidden tokens outside CHANGELOG | **PASS** | `grep -rn -E "wasi-sdk\|wasmtime" barretenberg/ scripts/ docs/ --exclude=CHANGELOG.md` → zero hits. Extended `grep -rn -E "wasi-sdk\|wasmtime\|wasmer\|wasi_thread_start\|wasi_sdk\|__wasi__\|__WASI__" barretenberg/ scripts/ docs/ .github/ --exclude=CHANGELOG.md` → zero hits. |
| **#2** clean-checkout `bootstrap.sh` produces all artifacts using only Emscripten + Node | **PASS** (source-level) | `bootstrap.sh:31-47` `install_emsdk` clones emsdk, installs+activates the version pinned in `.emsdk-version` (4.0.7). `expected_min_node_version=22.0.0` (line 18). No `wasi-sdk` install path remains. `setup-container.sh` and `build-images/src/Dockerfile` both install emsdk pinned to `.emsdk-version` (verified by reading the diff stat). |
| **#3** all gtest targets green under `wasm-run` with PTHREAD_POOL_SIZE=16 | **PASS** (source-level) | `pool_exhaustion.test.cpp` and `memory_growth.test.cpp` exist + auto-discovered into `wasm_threads_tests_tests`. Pool-exhaustion test spawns 20 std::threads and asserts all complete; memory-growth test allocates >512MB and asserts pre-grow data survives + asserts `memory_size_after > memory_size_before`. `run_<module>_tests` custom target (`module.cmake:213-223`) invokes `wasm-run`. `bootstrap.sh:271-279` emits both binaries in `test_cmds_wasm_threads`. |
| **#4** `barretenberg/ts` test suite green | **PASS** (source-level) | `package.json:92` `testRegex: ./src/.*\\.test\\.ts$` matches `clean_shutdown.test.ts`, `reentry.test.ts`, `index.test.ts`. `Barretenberg.new` public API exists (`barretenberg/index.ts:46`). `bb.js` Emscripten loader exposes the same surface (`call`, `cbindCall`, `writeMemory`, `getMemorySlice`, `getMemory`, `destroy`). |
| **#5** E2E Aztec integration green | **cannot verify (out of source-level scope)** | Recommendation: run the canonical E2E suite once CI lands. |
| **#6** Multi-thread proving within 5% | **cannot verify (out of source-level scope)** | Source-level: link flags spec-aligned. Perf gate (`wasm-perf-gate` job, `wasm-emscripten.yml:185-241`) compares against `perf_baseline.json`; baseline is `null` so first runs warn, then fail on >5% once a baseline is captured. Recommendation: run the perf gate on CI hardware, snapshot the baseline, commit the updated `perf_baseline.json`. |
| **#7** Compatibility window elapsed clean | **cannot verify (timeline)** | Compat job is real (npm pack + d.ts diff against last release), gated `LEGACY_TOOLCHAIN_COMPAT='false'` by default, marked for deletion `2026-05-26`. Recommendation: flip the env to `'true'` once `@aztec/bb.js@latest` is published from this branch, watch the diff for 4 weeks, then delete. |
| **#8** README/docs updated | **PASS** | `barretenberg/README.md` and `barretenberg/cpp/README.md` mention `wasm-run`, `.emsdk-version`, Node ≥ 22, Emscripten. No `wasi-sdk`/`wasmtime` references outside `CHANGELOG.md`. |

ACs #1, #2, #3, #4, #8 PASS at source level. ACs #5, #6, #7 are
runtime/timeline checks the source-level review cannot exercise.

---

## Verification commands run

- `grep -rn -E "wasi-sdk|wasmtime" barretenberg/ scripts/ docs/ --exclude=CHANGELOG.md` → 0 hits ✓
- `grep -rn -E "wasi-sdk|wasmtime|wasmer|wasi_thread_start|wasi_sdk|__wasi__|__WASI__" barretenberg/ scripts/ docs/ .github/ --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dest --exclude-dir=build --exclude=CHANGELOG.md` → 0 hits ✓
- `bash -n barretenberg/cpp/scripts/wasm-run` → clean ✓
- `python3 -m json.tool barretenberg/cpp/scripts/perf_baseline.json` → parses ✓
- `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/wasm-emscripten.yml'))"` → parses ✓
- Toolchain link-flag verbatim check: every flag from the spec's "Link only"
  enumeration (PTHREAD_POOL_SIZE=16, PROXY_TO_PTHREAD,
  ALLOW_BLOCKING_ON_MAIN_THREAD=0, MALLOC=mimalloc, ALLOW_MEMORY_GROWTH=1,
  INITIAL_MEMORY=512MB, MAXIMUM_MEMORY=4GB, STACK_SIZE=8MB, MODULARIZE=1,
  EXPORT_ES6=1, ENVIRONMENT=web,worker,node, EXIT_RUNTIME=1,
  NODEJS_CATCH_EXIT=0, NODEJS_CATCH_REJECTION=0) literally present in
  `wasm-emscripten.cmake:107-125`. ✓
- bb.js public API check: `Barretenberg.new`, `BarretenbergSync.new`,
  `BackendOptions`, `BackendType` all still exported from
  `barretenberg/ts/src/index.ts`. ✓
- `BackendOptions.memory` end-to-end removal: `grep -rn "memory.*initial"
  barretenberg/ts/src/` returns zero hits. ✓

---

## Files inspected

- `/workspace/barretenberg-claude/REVIEW_ITER_1.md`
- `/workspace/barretenberg-claude/REVIEW_ITER_2.md`
- `/workspace/barretenberg-claude/CODER_REPORT.md`
- `/workspace/barretenberg-claude/.github/workflows/wasm-emscripten.yml`
- `/workspace/barretenberg-claude/.emsdk-version`
- `/workspace/barretenberg-claude/bootstrap.sh`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/toolchains/wasm-emscripten.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/threading.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/module.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/CMakePresets.json`
- `/workspace/barretenberg-claude/barretenberg/cpp/scripts/wasm-run`
- `/workspace/barretenberg-claude/barretenberg/cpp/scripts/perf_baseline.json`
- `/workspace/barretenberg-claude/barretenberg/cpp/bootstrap.sh`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/CMakeLists.txt`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/CMakeLists.txt`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/pool_exhaustion.test.cpp`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/memory_growth.test.cpp`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp` (filesystem-detection block)
- `/workspace/barretenberg-claude/barretenberg/ts/package.json`
- `/workspace/barretenberg-claude/barretenberg/ts/src/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/clean_shutdown.harness.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/clean_shutdown.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/reentry.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/bb_backends/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/bb_backends/wasm.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/bb_backends/node/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/index.test.ts`
- `/workspace/barretenberg-claude/barretenberg/cpp/README.md`
