# Finalise — wasi-sdk → Emscripten migration

Branch: `coder/wasi-to-emscripten-migration`
HEAD: `de031e1ca0`
Reviewer: independent verification across three iterations
(`REVIEW_ITER_1.md`, `REVIEW_ITER_2.md`, `REVIEW_ITER_3.md`).

## Sign-off

This branch is **APPROVED at the source level** for the migration from
`wasi-sdk` + the legacy host runtime to **Emscripten + Node 22**. Every
acceptance criterion that can be verified by reading the tree passes;
every blocker and major finding from iterations 1 and 2 has been closed
with a real source-level edit and remains closed (no regressions
introduced when fixing later findings); both spec-verbatim and extended
grep gates return zero hits.

What remains before the migration can be **shipped**:

1. Run the new CI workflow (`.github/workflows/wasm-emscripten.yml`) on
   real CI hardware. The toolchain itself was not exercised in the
   review container (per spec, no emsdk install). The four CI jobs
   (`wasm-grep-gate`, `wasm-threaded-tests`, `bbjs-shutdown-and-reentry`,
   `wasm-perf-gate`) collectively cover ACs #1–#4 and #6 end-to-end.
2. Snapshot a `baseline_ms` into `barretenberg/cpp/scripts/perf_baseline.json`
   once a stable run lands; the perf gate currently warns rather than
   fails because the baseline is `null`.
3. Wait the 4-week compatibility window (legacy-toolchain-compat job
   gated `LEGACY_TOOLCHAIN_COMPAT='false'`; flip to `'true'` against the
   first published `@aztec/bb.js` from this branch). Comment in the
   workflow says **delete the job after 2026-05-26**.
4. Run the canonical Aztec E2E suite (AC#5) once a wasm build is
   produced — outside the source-level scope.

## Final acceptance criteria walk

| AC | Status | Evidence |
|----|--------|----------|
| **#1** zero forbidden tokens outside `CHANGELOG.md` | **PASS** | Spec gate `grep -rn -E "wasi-sdk\|wasmtime" barretenberg/ scripts/ docs/ --exclude=CHANGELOG.md` → 0 hits. Extended gate `grep -rn -E "wasi-sdk\|wasmtime\|wasmer\|wasi_thread_start\|wasi_sdk\|__wasi__\|__WASI__" barretenberg/ scripts/ docs/ .github/ --exclude=CHANGELOG.md` → 0 hits. CI `wasm-grep-gate` enforces both. |
| **#2** clean-checkout `bootstrap.sh` produces all artifacts using only Emscripten + Node | **PASS (source level)** | `bootstrap.sh:31-47` `install_emsdk` clones+activates the version pinned in `.emsdk-version` (`4.0.7`). `expected_min_node_version=22.0.0`. No wasi-sdk install path remains anywhere. `setup-container.sh` and `build-images/src/Dockerfile` install the same pinned emsdk. |
| **#3** all gtest targets green under `wasm-run` with PTHREAD_POOL_SIZE=16 | **PASS (source level)** | `wasm-emscripten.cmake:108` sets `-sPTHREAD_POOL_SIZE=16`; `:109` sets `_STRICT=1` (elastic growth). The four mandatory tests are wired: `pool_exhaustion.test.cpp` (20 threads, 60s deadline guard), `memory_growth.test.cpp` (8×96MiB+4MiB > 512MB INITIAL_MEMORY, std::barrier sync, per-thread + shared-buffer memcmp, `__builtin_wasm_memory_size` pre/post check), `clean_shutdown.test.ts` (parallel `srsInitSrs` + blake2s, 5s post-destroy budget, `process.exit(2)` on hang), `reentry.test.ts` (pinned `BackendType.Wasm`, blake2s round-trip on both instances against known-correct hash). Auto-discovered into `wasm_threads_tests_tests` via `barretenberg_module()` glob. `run_<module>_tests` custom target (`module.cmake:213-223`) invokes `wasm-run`. `bootstrap.sh:271-279` `test_cmds_wasm_threads` emits both `ecc_tests` and `wasm_threads_tests_tests` lines. |
| **#4** `barretenberg/ts` test suite green | **PASS (source level)** | `package.json:92` testRegex matches the two new test files. Public API surface preserved: `Barretenberg.new({ threads: N })` exists and forwards to Emscripten via `factory({ pthreadPoolSize: N })`. `BackendOptions.memory` removed end-to-end (no longer a polite lie). |
| **#5** E2E Aztec integration green | **deferred to CI** | Out of source-level scope. Run the canonical Aztec E2E suite once the wasm artifacts are produced. |
| **#6** Multi-thread proving within 5% | **deferred to CI** | Source-level: link flags spec-verbatim. `wasm-perf-gate` (real `ultra_honk_bench` run, baseline JSON file, warns on null baseline / fails on >5%). Snapshot the baseline once a stable CI run lands. |
| **#7** Compatibility window elapsed clean | **deferred to timeline** | Compat job is real (`npm pack` of `@aztec/bb.js@latest` and a d.ts public-export diff), gated `LEGACY_TOOLCHAIN_COMPAT='false'` by default, marked `DELETE THIS JOB AFTER 2026-05-26`. Flip the env to `'true'` once the new bb.js is published; watch the surface diff for 4 weeks; delete the job. |
| **#8** README/docs updated | **PASS** | `barretenberg/README.md` and `barretenberg/cpp/README.md` mention `wasm-run`, `.emsdk-version`, Node ≥ 22, Emscripten. No `wasi-sdk`/`wasmtime` outside `CHANGELOG.md`. v4.2.0 frozen operator doc was edited in place to reflect the new toolchain (the freeze rule did not apply to a factually wrong toolchain mention — see iter-2 punch list item 2). |

## Toolchain link flags — spec-verbatim check

Every flag from the spec's "Link only" enumeration is present in
`wasm-emscripten.cmake:107-125`, in spec-verbatim no-space SHELL form:

```cmake
add_link_options(
    "SHELL:-sPTHREAD_POOL_SIZE=16"
    "SHELL:-sPTHREAD_POOL_SIZE_STRICT=1"
    "SHELL:-sPROXY_TO_PTHREAD"
    "SHELL:-sALLOW_BLOCKING_ON_MAIN_THREAD=0"
    "SHELL:-sMALLOC=mimalloc"
    "SHELL:-sALLOW_MEMORY_GROWTH=1"
    "SHELL:-sINITIAL_MEMORY=512MB"
    "SHELL:-sMAXIMUM_MEMORY=4GB"
    "SHELL:-sSTACK_SIZE=8MB"
    "SHELL:-sMODULARIZE=1"
    "SHELL:-sEXPORT_ES6=1"
    "SHELL:-sEXPORT_NAME=createBarretenbergModule"
    "SHELL:-sENVIRONMENT=web,worker,node"
    "SHELL:-sEXIT_RUNTIME=1"
    "SHELL:-sNODEJS_CATCH_EXIT=0"
    "SHELL:-sNODEJS_CATCH_REJECTION=0"
    "SHELL:-sABORTING_MALLOC=0"
)
```

`-sASSERTIONS=2 -sSAFE_HEAP=1 -sSTACK_OVERFLOW_CHECK=2` are in the
`CMAKE_EXE_LINKER_FLAGS_DEBUG_INIT` block (line 132-133), debug-only,
per spec.

`PTHREAD_POOL_SIZE_STRICT=1` is intentional — STRICT=2 was the iter-2
blocker (the 17th `pthread_create` would be rejected, contradicting
the pool-exhaustion test); STRICT=1 warns + elastically grows, which
is the property the test exercises.

`-sINITIAL_MEMORY=512MB` and `-sMAXIMUM_MEMORY=4GB` are present and
were NOT dropped while fixing G7 (the iter-2 finding about the
runtime API): G7's fix was to drop the runtime-only `INITIAL_MEMORY`
key from the Emscripten factory init object, not the link-time flag.
Verified.

## Branch commit log

```
de031e1ca0 docs(coder): mention exit-code fix commit in iter-3 summary
72c119be86 fix(wasm-run): disable errexit before invoking Node so non-zero exit codes propagate
cc0f85a333 docs(coder): add Iteration 3 finding-by-finding remediation summary
5036eb4f93 fix(bb.js): drop ineffectual memory option, exercise pthread pool + reentry properly
4671ba0a1f fix(wasm): close iter-2 blockers — pool-exhaustion strict=1, mem-grow scaled, cli11 __wasi__, SHELL no-space
883ae3cc25 docs(coder): add Iteration 2 finding-by-finding remediation summary
bb34579d51 docs(ci): correct wasm-emscripten.yml header comment about gate allowlist
68229ce8bd fix(wasm): wire wasm-run --dir/--mem; warm pthread pool in shutdown harness; clean dead shims and aliases
044ecad833 fix(wasm): align toolchain link flags with spec; remove non-Emscripten runtime driver and grep-gate excludes
c3879a87a1 docs(coder): summary of wasi-sdk -> Emscripten migration changes
063cfdb3d8 test(wasm): add migration regression tests + CI gates
3ba467dd2c feat(bb.js): replace custom wasm worker harness with Emscripten loader
7fdb1b06a2 feat(wasm): switch toolchain from wasi-sdk to Emscripten
```

13 commits total: 3 feat + 1 test + 4 fix + 5 docs.

## Files changed (high level)

**New top-level files:**
- `.emsdk-version` (pinned 4.0.7)
- `.github/workflows/wasm-emscripten.yml` (CI gates)
- `barretenberg/cpp/cmake/toolchains/wasm-emscripten.cmake` (toolchain)
- `barretenberg/cpp/scripts/wasm-run` (Node launcher)
- `barretenberg/cpp/scripts/perf_baseline.json` (perf gate baseline)
- `barretenberg/cpp/README.md`
- `barretenberg/cpp/src/barretenberg/wasm_threads_tests/{CMakeLists.txt,pool_exhaustion.test.cpp,memory_growth.test.cpp}`
- `barretenberg/ts/src/barretenberg/{clean_shutdown.harness.ts,clean_shutdown.test.ts,reentry.test.ts}`

**Deleted:**
- `barretenberg/cpp/cmake/toolchains/wasm32-wasi.cmake`
- `barretenberg/cpp/scripts/wasmtime.sh`
- `barretenberg/cpp/scripts/benchmark_wasm_remote_wasmer.sh`
- `barretenberg/cpp/src/barretenberg/wasi/{CMakeLists.txt,wasi_stubs.cpp,wasm_init.cpp}`
- `barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_thread/` (entire subtree)
- `barretenberg/ts/src/barretenberg_wasm/fetch_code/` (entire subtree)
- `barretenberg/ts/src/barretenberg_wasm/{barretenberg_wasm_main,barretenberg_wasm_thread}/factory/browser/` (entire subtree)
- `barretenberg/ts/src/barretenberg_wasm/helpers/browser/`

**Edited (substantive):**
- `bootstrap.sh` (replaced `install_wasi_sdk` with `install_emsdk`, dropped Node floor to 22.0.0)
- `barretenberg/bootstrap.sh` (Node + emsdk floor checks)
- `scripts/setup-container.sh`, `build-images/src/Dockerfile` (emsdk install layer)
- `barretenberg/cpp/CMakePresets.json` (presets target the new toolchain)
- `barretenberg/cpp/cmake/{module,threading}.cmake` (`run_<module>_tests` target, SHARED_MEMORY, pool size override)
- `barretenberg/cpp/src/CMakeLists.txt` (drops `--export-memory`, wires `wasm_threads_tests`)
- `barretenberg/cpp/scripts/{benchmark_wasm,benchmark_wasm_remote,run_bench,profile_wasm_samply,ci_benchmark_ivc_flows}.sh` (switched to wasm-run)
- `barretenberg/cpp/bootstrap.sh` (`test_cmds_wasm_threads` emits both binaries)
- `barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp` (vendored: `__wasi__` branch removed)
- `barretenberg/ts/package.json` (conditional exports map; new artifact triple)
- `barretenberg/ts/scripts/{copy_wasm,browser_postprocess}.sh` (artifact layout)
- `barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts` (thin Emscripten loader; `_initialize` and runtime memory keys gone)
- `barretenberg/ts/src/barretenberg_wasm/index.ts` (`fetchModuleAndThreads` becomes thread-counting helper)
- `barretenberg/ts/src/bb_backends/index.ts` (`BackendOptions.memory` removed)
- `barretenberg/ts/src/bb_backends/{node,browser,wasm}.ts` (drop `memory` plumbing)
- `barretenberg/README.md`, `barretenberg/cpp/README.md`, `barretenberg/.claude/skills/{benchmark-chonk,profile-chonk,remote-bench}/SKILL.md`, `docs/docs-operate/operators/setup/building-from-source.md`, `docs/network_versioned_docs/version-v4.2.0/operators/setup/building-from-source.md`, `barretenberg/ts/docs/docs/how_to_guides/on-the-browser.md` (docs)
- `barretenberg/cpp/.gitignore`, `barretenberg/cpp/scripts/audit/generate_audit_status_headers.sh`, `barretenberg/cpp/scripts/line_count.py`, `barretenberg/cpp/src/barretenberg/{common/thread.cpp,benchmark/basics_bench/basics.bench.cpp}` (incidental cleanups)

72 files changed; +2204 / −1091 lines.

## Items that cannot be checked at source level

Per the spec, `clone_repo` runs in a sandbox that does not have emsdk
installed. The following were therefore not exercised during review:

- **AC#5** — Aztec E2E integration. Out of scope for source-level
  review. **Recommendation**: run `yarn-project/end-to-end/scripts/run_test.sh`
  for the canonical wasm flows once CI artifacts land.
- **AC#6** — Multi-thread proving within 5% of native. **Recommendation**:
  let `wasm-perf-gate` run; capture the first `ultra_honk_bench`
  result; commit the baseline `ms` into `perf_baseline.json` so
  subsequent runs gate on >5% drift.
- **AC#7** — 4-week compatibility window. **Recommendation**: flip
  `LEGACY_TOOLCHAIN_COMPAT` to `'true'` once `@aztec/bb.js@latest`
  on npm reflects this branch; monitor the d.ts export diff; delete
  the job at the comment-marked **2026-05-26** boundary.
- **emcc + emsdk verification** — Toolchain edits (the `STRICT=1`
  semantics, the `__builtin_wasm_memory_size` assertion in
  `memory_growth.test.cpp`, the `srsInitSrs`-driven pool-warming
  harness) will be exercised by CI under the `wasm-threaded-tests`
  and `bbjs-shutdown-and-reentry` jobs.

## Minor follow-up suggestions (not blocking)

These were noted during review but are not blockers; they can land in a
follow-up PR or be left as-is:

1. **`clean_shutdown.test.ts` ts-node loader.** The test child process
   uses `--loader ts-node/esm` (line 30) for ESM resolution under Node
   22+. This is fine but tightly couples the test to ts-node; if
   ts-node is removed from devDependencies the harness silently breaks.
   Consider materialising a compiled `.js` harness at test time, or
   pinning the ts-node version explicitly.
2. **`barretenberg_wasm_base` alias.** The TODO marker at
   `barretenberg_wasm_base/index.ts:8` references `2026-05-26` —
   matching the legacy-job removal date. When the compat window
   closes, both should be deleted in lockstep.
3. **`perf_baseline.json` snapshotting.** The first stable CI run on
   the migration's hardware should commit a non-null `baseline_ms`
   value. Until then, the perf gate is a warn-only no-op.
4. **`wasm-run --mem` informational notice.** The script prints to
   stderr that `--mem` is informational. If callers are not expected
   to use `--mem` at all (now that the toolchain `INITIAL_MEMORY` is
   the only knob), consider deleting `--mem` from the CLI surface in
   a follow-up.

None of these affect the migration's correctness, security, or spec
compliance.

## Final sign-off

**The wasi-sdk → Emscripten migration is complete at the source level.**

All blockers and majors from iterations 1 and 2 are closed. The
toolchain, test wiring, public API, and CI gates collectively express
the spec's intent. Remaining ACs (#5, #6, #7) are runtime/timeline
checks that depend on a real CI run and the 4-week compatibility window;
they are not source-level review items.

Reviewer: independent verification via three iterations.
Branch HEAD verified: `de031e1ca0`.
Date: 2026-04-28.
