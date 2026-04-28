# Review iter 1 — wasi-sdk → Emscripten migration

Branch under review: `coder/wasi-to-emscripten-migration` (HEAD `c3879a87a1`).
Reviewer: independent verification of `CODER_REPORT.md` against repo state.

## Verdict: **NOT COMPLETE**

The Coder's claim that "the final grep gate returns zero hits" is achieved
only by adding `--exclude-dir=*versioned_docs` and `--exclude=cli11.hpp`
flags to the gate that the spec does **not** sanction. The spec acceptance
criterion #1 says "zero outside CHANGELOG". On a verbatim run of the spec
gate the tree has stale references. Beyond that, the toolchain file is
missing **multiple link flags that the spec lists as canonical**, the
`wasm-run` script's `--dir` / `--mem` flags export env vars that nothing
consumes, the bb.js shutdown harness fails to actually warm the pthread
pool (so the 5-second-shutdown property is not exercised), the bootstrap
test plan still only runs `ecc_tests` instead of the new
`wasm_threads_tests_tests`, and a stray `benchmark_wasm_remote_wasmer.sh`
still drives a `wasmer` runtime that the spec deletes by intent.

Do **not** write `Finalise.md`. Bounce to Coder for iteration 2.

---

## Findings

| # | Severity | Spec clause | Evidence | Required fix |
|---|----------|-------------|----------|--------------|
| F1 | **blocker** | AC #1 ("zero outside CHANGELOG") | `grep -r "wasi-sdk\|wasmtime" barretenberg/ scripts/ docs/` returns `docs/network_versioned_docs/version-v4.2.0/operators/setup/building-from-source.md:301` and `barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp:145`. The CI workflow at `.github/workflows/wasm-emscripten.yml:65-72` makes this pass only by adding `--exclude-dir=network_versioned_docs --exclude-dir=developer_versioned_docs --exclude=cli11.hpp`, none of which are sanctioned by the spec. | Either (a) replace the wasi-sdk reference inside `version-v4.2.0/.../building-from-source.md` with "Emscripten + Node", or (b) if `docs/CLAUDE.md` truly forbids editing the frozen versioned doc, document the carve-out in `CHANGELOG.md` per spec and remove the `versioned_docs` excludes from the workflow gate. The cli11.hpp comment is in a vendored generated header — that exclude is defensible, but it must be an *explicit* spec-allowed exception list, not a silent grep flag. Update the workflow's pattern env vars so the regex *also* covers `wasi_sdk`, `wasi-threads`, and `wasi_thread_start` (orchestrator-mandated) and verify a fresh run is clean. |
| F2 | **blocker** | Spec "Canonical flags — link only" | `barretenberg/cpp/cmake/toolchains/wasm-emscripten.cmake:91-112` is missing `-sPROXY_TO_PTHREAD`, `-sALLOW_BLOCKING_ON_MAIN_THREAD=0`, `-sMALLOC=mimalloc`, and the `web` token in `-sENVIRONMENT`. `INITIAL_MEMORY` is `33554432` (32 MiB) — the spec mandates `512MB`. `STACK_SIZE` is `1048576` (1 MiB) — the spec mandates `8MB`. `ENVIRONMENT=node,worker` — the spec mandates `web,worker,node`. | Edit `wasm-emscripten.cmake` to bring every flag in the spec's "Link only" enumeration into `add_link_options(...)`. Use the *exact* values: `INITIAL_MEMORY=512MB`, `MAXIMUM_MEMORY=4GB`, `STACK_SIZE=8MB`, `PTHREAD_POOL_SIZE=16`, `PROXY_TO_PTHREAD`, `ALLOW_BLOCKING_ON_MAIN_THREAD=0`, `MALLOC=mimalloc`, `ALLOW_MEMORY_GROWTH=1`, `MODULARIZE=1`, `EXPORT_ES6=1`, `ENVIRONMENT=web,worker,node`, `EXIT_RUNTIME=1`, `NODEJS_CATCH_EXIT=0`, `NODEJS_CATCH_REJECTION=0`. Test/debug-only flags `-sASSERTIONS=2 -sSAFE_HEAP=1` go in the Debug variant. Drop bespoke values like 32 MiB initial / 1 MiB stack — they make the threaded benchmark unrunnable at scale and put the perf gate on the wrong side of the 5% line. |
| F3 | **major** | Spec "wasm-run" abstraction layer | `barretenberg/cpp/scripts/wasm-run` exports `BB_WASM_DIRS` and `BB_WASM_INITIAL_MEMORY` (lines 130-134) but **no source file in `barretenberg/cpp/src` reads either** (`grep -rn "BB_WASM_DIRS\|BB_WASM_INITIAL_MEMORY"` returns zero hits). The `--dir=PATH` flag is a no-op beyond setting `NODERAWFS=1`, and `--mem=BYTES` is silently ignored. | Either wire the env vars through to Emscripten's `Module()` factory at runtime (the loader can honor a runtime `INITIAL_MEMORY` when `MODULARIZE=1`), or strip the flags entirely. Don't keep a CLI surface that pretends to work and doesn't. If the spec's `--dir` semantics are meant to gate which host paths the wasm sandbox sees, you need a real allowlist via `MOUNT_NODEFS` or by emitting a small JS prelude — `NODERAWFS=1` opens *the entire host filesystem*, which is the opposite of an allowlist. |
| F4 | **major** | Mandatory test #3 (Clean shutdown — create→work→destroy→exit ≤5s) | `barretenberg/ts/src/barretenberg/clean_shutdown.harness.ts:25-29` "tickles" the pthread pool with `for (let i = 0; i < 16; ++i) { void i; }` — that loop does literally nothing. The pthread pool is never warmed, so the test does **not** exercise the bug class. The 5-second assertion in `clean_shutdown.test.ts:63` becomes trivially passing because there is no pool to tear down. | Replace the `void i;` loop with calls that actually dispatch work into the pthread pool — e.g. `await bb.blake2s(Uint8Array.from(...))` invoked enough times to be sure every worker has executed at least one task. Then assert post-destroy idle. Also delete the `backend: undefined as any` cast on line 16; either spec the backend explicitly (`BackendType.Wasm`) or drop the field. |
| F5 | **major** | Phase 5 ("CI grep gate enforces zero references") | `.github/workflows/wasm-emscripten.yml:65-72` builds the regex from split env vars to avoid self-matching. That's fine. But the regex pattern is just `wasi-sdk\|wasmtime`. The orchestrator review prompt requires the gate to also catch `wasi_sdk`, `wasi-threads`, `wasi_thread_start` per the migration's spirit. | Extend the regex to `(wasi-sdk\|wasi_sdk\|wasi-threads\|wasi_thread_start\|wasmtime)`. Re-run locally; expect zero hits. If the `@emnapi/wasi-threads` lockfile entries match (they do today, see `grep` evidence above), narrow the regex with a word boundary or exclude `*lock*` files explicitly with a justification in the workflow. |
| F6 | **major** | Spec phase 4 ("delete `wasi_thread_start` polyfill, custom Worker harness, threads/no-threads runtime branching") | The directory `barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_thread/` is gone — good. But `barretenberg/ts/src/barretenberg_wasm/fetch_code/node/index.ts` still exists and still mirrors the legacy "fetch the gzipped wasm by hand and pako-ungzip it" path (lines 20-34). With the Emscripten loader the glue compiles its own bundled wasm; nothing in the new `BarretenbergWasmMain` consumes the bytes returned by `fetchCode`. | Delete `fetch_code/` outright. Anything that still imports `fetchCode` should pivot to letting Emscripten's `createBarretenbergModule(...)` resolve the wasm. If a downstream consumer needs the raw bytes for a pre-warm cache, expose the URL of the wasm artifact and let them fetch it directly without pako. |
| F7 | **major** | "Did the Coder rename `wasi/` to `wasm_env/` and carry over function symbols" | The C++ rename happened: `barretenberg/cpp/src/barretenberg/wasm_env/` exists with `wasm_init.cpp` and `CMakeLists.txt`. **However**, the rename is incomplete — the rename's *purpose* per the report was to delete the WASI imports. The remaining shim `wasm_init.cpp` exports `_initialize` as `WASM_EXPORT`. Under Emscripten with `EXPORT_ALL=1` (set in `src/CMakeLists.txt:259`) this is fine, but the bb.js loader at `barretenberg_wasm_main/index.ts:118-120` still calls `this.module._initialize()` defensively. If the symbol is ever stripped during a release-mode link, that call throws. | Either remove the `_initialize` shim entirely (Emscripten runs ctors before any export is callable, per the shim's own comment) and stop calling it from bb.js, or wrap the bb.js side in a `typeof ... === 'function'` guard — which it already does, so this is at minimum a doc-only finding: delete the dead shim and the dead caller in tandem to avoid leaving zombie code that *could* be load-bearing. |
| F8 | **major** | Acceptance criterion #1 / Phase 5 cleanup | `barretenberg/cpp/scripts/benchmark_wasm_remote_wasmer.sh` still exists and on line 30 invokes `/home/ubuntu/.wasmer/bin/wasmer run --dir=... --enable-threads ...`. The Coder report does not mention this file. `wasmer` is a sibling WASI runtime that `wasmtime` was the *other* form of; the spec deletes wasi-sdk + wasmtime end-to-end and keeping a `wasmer` driver is contrary to the "1:1 CLI replacement" mandate. | Delete `benchmark_wasm_remote_wasmer.sh`. If the remote benchmark workflow needs an alternate runtime path, replace it with the existing `benchmark_wasm_remote.sh` plus `wasm-run`. |
| F9 | **major** | Mandatory test wiring under bootstrap | `barretenberg/cpp/bootstrap.sh:271-274` `test_cmds_wasm_threads` only emits `ecc_tests`. The new `wasm_threads_tests_tests` binary (added to validate pool exhaustion + memory growth) is **not** run under the standard bootstrap test plan — only under the dedicated `wasm-threaded-tests` CI workflow. A developer running `./bootstrap.sh test wasm_threads` would not exercise the new regression suite. | Append `echo "$hash barretenberg/cpp/scripts/wasm-run barretenberg/cpp/build-wasm-threads/bin/wasm_threads_tests_tests"` to `test_cmds_wasm_threads`. While there, decide whether the new tests should be opt-in via a separate `test_cmds_wasm_regression` so users can run them in isolation. |
| F10 | **major** | Toolchain — `WASM_EXCEPTIONS` validation | `wasm-emscripten.cmake:62-77` accepts `wasm`/`none` and rejects everything else with FATAL_ERROR. Good. But the `wasm` preset at `CMakePresets.json:413` sets `WASM_EXCEPTIONS=none` (single-threaded build with no exceptions) and `wasm-threads`/`wasm-threads-dbg` set `wasm`. The spec says "wasm-exceptions is the only supported release path; legacy JS exceptions are rejected". The single-threaded preset suppressing exceptions entirely is a behavioral divergence from the threaded path that is not documented in the migration plan. | Either change the single-threaded `wasm` preset to also use `WASM_EXCEPTIONS=wasm`, or add an explicit comment block in `CMakePresets.json` and the migration changelog explaining why the single-thread fallback uses `none`. The current state is an undocumented divergence between the two paths and will surface as silent-`abort()` regressions if any exception-throwing code runs in the single-threaded fallback. |
| F11 | **minor** | "no legacy JS exceptions" — verifier | The toolchain rejects bad values for `WASM_EXCEPTIONS` but *also* still exposes `-fno-exceptions` (the `none` value) as legitimate. The spec is "wasm exceptions or none — no legacy JS exceptions". `-fno-exceptions` is not "legacy JS exceptions"; it's no-exceptions. So the toolchain is technically compliant. But there is no test that confirms a hand-edit setting `-DWASM_EXCEPTIONS=javascript` actually fails configure-time. | Add a CTest-side smoke test that re-invokes cmake with `-DWASM_EXCEPTIONS=javascript` and asserts FATAL_ERROR. This is cheap insurance against a regression in the gating. |
| F12 | **minor** | Spec "delete the `barretenberg_wasm_thread/` polyfill" | The directory is gone — verified via `ls`. However, `barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_base/index.ts` remains as a one-line re-export of `BarretenbergWasmMain` under the legacy name. That is an alias, not a removal. The spec says "Replace with thin loader" — this aliasing is acceptable for transitional source-compat but creates two names for the same class. | Either delete the `barretenberg_wasm_base/` dir and grep-rewrite the two callers (`poseidon.bench.test.ts`, `wasm.ts`) to import from `barretenberg_wasm_main/index.js` directly, or commit to the alias and add a `// TODO(2026-05-26): drop alias` marker tied to the compatibility-window expiry. Right now there's no plan to remove the alias. |
| F13 | **minor** | Spec "Module({ pthreadPoolSize })" plumbing | `barretenberg_wasm_main/index.ts:103-113` passes `pthreadPoolSize: this.threads` into the factory. Emscripten's `Module()` config key is `PTHREAD_POOL_SIZE` (uppercase) when overriding link-time settings at runtime; `pthreadPoolSize` is not a documented Emscripten Module setting. The Coder may have invented this name. | Verify against Emscripten 4.0.7 docs. If `pthreadPoolSize` is unrecognized, the runtime falls back to the link-time value of 16 silently — meaning the `Barretenberg.new({ threads: 4 })` call gives you 16 worker threads, which makes the perf gate misleading and the resource footprint wrong. Probably needs `PTHREAD_POOL_SIZE: this.threads` or a getter pattern. |
| F14 | **minor** | wasm-run shell script — POSIX correctness | `wasm-run` is `#!/usr/bin/env sh` but uses Bash-isms? On a quick read it's POSIX-clean (no `[[ ]]`, no arrays, parameter expansion is POSIX-compliant). However, line 144 unconditionally passes `--experimental-wasm-threads` to Node. In Node >=22.0, that flag is no longer recognized as `experimental` and Node may print a deprecation warning that the test harness's stdout-matching (e.g. the `DESTROY_AT=` regex in clean_shutdown.test.ts) does not anticipate. | Drop `--experimental-wasm-threads`. Node 22 has WebAssembly threads on by default. If the flag is truly needed for some legacy minor, gate it on a Node version check. |
| F15 | **minor** | bb.js artifact layout — `package.json` exports | `package.json:9-18` exports `./barretenberg.wasm`, `./barretenberg.js`, `./barretenberg.worker.mjs`. The exports map only points at the `node` flavor (`./dest/node/...`); browser consumers importing `@aztec/bb.js/barretenberg.js` get the Node bundle, not the browser one. The `files` array correctly lists all three flavors but `exports` is one-shot. | Use the conditional `exports` syntax (`{ "node": "./dest/node/...", "browser": "./dest/browser/..." }`) for each subpath export so browser consumers resolve the right glue. |
| F16 | **minor** | Compatibility-window legacy job | `.github/workflows/wasm-emscripten.yml:205-215` declares `legacy-toolchain-compat` gated by `LEGACY_TOOLCHAIN_COMPAT == 'true'` and the body is just an `echo` "this job is disabled". The spec describes the compatibility window as "parallel legacy job for ~4 weeks" — i.e., a **functioning** legacy path running alongside the new one. A no-op `echo` is not a parallel legacy job; it's the appearance of one. | Either implement the legacy job as a real wasi-sdk + wasmtime build path (which contradicts AC #1 — so pre-flag it) or **delete** the job declaration entirely and rely on the v4.2.0 freeze for rollback. As-is the workflow lies about what the compatibility window covers. |
| F17 | **minor** | Toolchain `_initialize` shim | `wasm_env/wasm_init.cpp:12-15` defines `_initialize` as an empty `WASM_EXPORT`. Per its own comment "Emscripten runs ctors before exported functions become callable", this function is dead. | Delete the file. Drop the `wasm_env` subdir's CMakeLists.txt `barretenberg_module(wasm_env)` line if it produces no objects, or keep the directory only if there is genuinely a future plan to reintroduce env-shim symbols. |
| F18 | **minor** | Toolchain — `RelWithDebInfo` linker flags | `wasm-emscripten.cmake:121-122` initializes `CMAKE_EXE_LINKER_FLAGS_RELWITHDEBINFO_INIT` with `-O3 -g -sASSERTIONS=1`. But `wasm-threads-dbg` preset uses `CMAKE_BUILD_TYPE=Debug`, not `RelWithDebInfo`. So the `-sASSERTIONS=1` value never fires. The Debug flags `_DEBUG_INIT` set `-O1 -g -sASSERTIONS=2 -sSAFE_HEAP=1 -sSTACK_OVERFLOW_CHECK=2`. That works. The `RelWithDebInfo` block is unused. | Either delete the unused `RELWITHDEBINFO_INIT` block, or wire a `wasm-threads-relwithdebinfo` preset that uses it. Don't ship dead config. |

---

## Acceptance criteria walk-through

| AC | Pass/Fail | Evidence |
|----|-----------|----------|
| **#1** zero forbidden tokens outside CHANGELOG | **FAIL** | See F1. `grep -r "wasi-sdk\|wasmtime" barretenberg/ scripts/ docs/` returns 2 non-CHANGELOG hits. |
| **#2** clean-checkout `bootstrap.sh` produces all artifacts | (cannot verify without running emcc) | Source-level: `bootstrap.sh:31-46 install_emsdk` is wired, but the `--mem`/`--dir` plumbing in wasm-run is dead (F3) so produced binaries cannot be invoked correctly under tests. Likely **FAIL** in practice. |
| **#3** all gtest targets green under `wasm-run` with PTHREAD_POOL_SIZE=16 | (cannot run) | Source-level: pool size is set to 16 in toolchain, but `PROXY_TO_PTHREAD` is missing so blocking on the main thread will deadlock for any test that calls a wasm export from the main JS thread (F2). Source-level **FAIL**. |
| **#4** `barretenberg/ts` test suite green | (cannot run) | Source-level: tests are wired (jest config, `*.test.ts` regex matches), but the `clean_shutdown` harness is structurally unable to validate the property it claims (F4). **FAIL**. |
| **#5** E2E Aztec integration green | (cannot verify) | Out of source-level scope. Skip. |
| **#6** Multi-thread proving within 5% | (cannot run) | Source-level: link flags diverge from spec (F2) so the 5% gate is meaningless until the canonical flags are restored. **FAIL**. |
| **#7** Compatibility window elapsed clean | (cannot verify timeline) | The compat job is a no-op echo (F16). **FAIL** in spirit. |
| **#8** README/docs updated | **PARTIAL** | `barretenberg/README.md` rewritten ✓, `barretenberg/cpp/README.md` added ✓, but `docs/network_versioned_docs/version-v4.2.0/operators/setup/building-from-source.md:301` still says `wasi-sdk` (the Coder cited `docs/CLAUDE.md` to defer; that is exactly the deferral the orchestrator told me to reject). **FAIL**. |

---

## Coder must do this in iteration 2

1. **Bring the toolchain link flags into spec compliance.** Edit `barretenberg/cpp/cmake/toolchains/wasm-emscripten.cmake` so that the `add_link_options` block contains, verbatim from the spec: `-sPTHREAD_POOL_SIZE=16 -sPROXY_TO_PTHREAD -sALLOW_BLOCKING_ON_MAIN_THREAD=0 -sMALLOC=mimalloc -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=512MB -sMAXIMUM_MEMORY=4GB -sSTACK_SIZE=8MB -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=web,worker,node -sEXIT_RUNTIME=1 -sNODEJS_CATCH_EXIT=0 -sNODEJS_CATCH_REJECTION=0`. Move `-sASSERTIONS=2 -sSAFE_HEAP=1` into the Debug variant block. Drop the bespoke 32-MiB initial / 1-MiB stack values.
2. **Make the spec grep gate pass without docs/cli11.hpp excludes.** Replace the wasi-sdk reference inside `docs/network_versioned_docs/version-v4.2.0/operators/setup/building-from-source.md:301` with "Emscripten + Node" (the freeze rule does not apply to a clearly factually wrong toolchain mention — the v4.2.0 build genuinely requires Node 22 + emsdk now). Remove `--exclude-dir=network_versioned_docs --exclude-dir=developer_versioned_docs --exclude=cli11.hpp` from `.github/workflows/wasm-emscripten.yml`. Keep cli11.hpp's vendored comment by allowlisting it in a `.grepignore`-style file (or `--exclude=cli11.hpp` is acceptable IF justified in a comment block tied to the spec's "vendored upstream" carve-out — but the docs exclusion is not justifiable).
3. **Extend the gate regex.** In `.github/workflows/wasm-emscripten.yml`, change the pattern to also catch `wasi_sdk`, `wasi-threads`, and `wasi_thread_start`. If the `@emnapi/wasi-threads` lockfile entries match, exclude lockfiles explicitly with a documented carve-out.
4. **Make `wasm-run`'s `--dir` and `--mem` flags real.** Either (a) plumb `BB_WASM_DIRS` and `BB_WASM_INITIAL_MEMORY` through to the Emscripten `Module()` factory by emitting a small `pre.js` that reads `process.env.BB_WASM_INITIAL_MEMORY` and sets `Module.INITIAL_MEMORY`, plus an FS-mount for each `BB_WASM_DIRS` entry, or (b) drop the flags from the CLI surface. As-is, the script is a polite lie.
5. **Fix the clean-shutdown harness.** Replace the `for (let i = 0; i < 16; ++i) { void i; }` loop in `barretenberg/ts/src/barretenberg/clean_shutdown.harness.ts:25-29` with real WASM calls that actually dispatch into the pthread pool (e.g. a `blake2s` over a 64-byte buffer in a loop of 64 iterations). Drop `backend: undefined as any` on line 16; explicitly set `backend: BackendType.Wasm`.
6. **Wire the new gtest binary into `bootstrap.sh`.** In `barretenberg/cpp/bootstrap.sh:271-274` `test_cmds_wasm_threads`, add a line: `echo "$hash barretenberg/cpp/scripts/wasm-run barretenberg/cpp/build-wasm-threads/bin/wasm_threads_tests_tests"`. Otherwise the canonical bootstrap test plan does not exercise the new regression suite.
7. **Delete `barretenberg/cpp/scripts/benchmark_wasm_remote_wasmer.sh`.** It still drives `wasmer` and is contrary to the spec's "1:1 CLI replacement" mandate.
8. **Delete `barretenberg/ts/src/barretenberg_wasm/fetch_code/`.** Under the Emscripten loader bb.js no longer fetches + decompresses + instantiates wasm by hand. Anything still importing from `fetch_code/` should be rewritten to use the JS glue's own loader.
9. **Verify Emscripten `Module()` runtime override key names.** The Coder used `pthreadPoolSize`; Emscripten 4.0.7 docs likely want `PTHREAD_POOL_SIZE` (uppercase, matching the link-time setting). Otherwise `Barretenberg.new({ threads: 4 })` silently gives you 16 threads. Fix `barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts:103-113` accordingly.
10. **Replace the `legacy-toolchain-compat` echo job** at `.github/workflows/wasm-emscripten.yml:205-215` with either a real legacy build path or remove the declaration. A no-op echo gated by an env var that defaults to `false` is performative, not functional.
11. **Make the `package.json` exports map respect browser/node flavors.** `barretenberg/ts/package.json:9-18` currently maps every subpath at `./dest/node/...`. Use the conditional-exports object form to disambiguate.
12. **Drop `--experimental-wasm-threads`** from the Node invocation in `barretenberg/cpp/scripts/wasm-run:144`. Node >=22 has WebAssembly threads on by default and the flag is a deprecation footgun.
13. **Either remove or formalize the single-threaded `WASM_EXCEPTIONS=none` divergence.** Document why the single-threaded preset disables exceptions and the threaded path does not. If there's no good reason, unify to `wasm`.
14. **Delete the `_initialize` shim** in `barretenberg/cpp/src/barretenberg/wasm_env/wasm_init.cpp` and the bb.js-side `if (typeof this.module._initialize === 'function') { this.module._initialize(); }` in `barretenberg_wasm_main/index.ts:118-120`. Both sides of the dead handshake should go.
15. **Consolidate the `barretenberg_wasm_base` alias**. Either delete `barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_base/index.ts` and rewrite the two consumers, or annotate the alias with a `// TODO(2026-05-26): drop after compatibility window` marker matching the legacy job's removal date.

---

## Things that are OK as-is (do not touch)

- `wasm32-wasi.cmake` deletion is confirmed (`ls barretenberg/cpp/cmake/toolchains/` shows it gone).
- `barretenberg_wasm_thread/` polyfill deletion is confirmed.
- `EMSDK` env var gating in toolchain (`wasm-emscripten.cmake:16-20`) is correct.
- `CMakePresets.json` parses (`python3 -m json.tool` clean) and binaryDir paths (`build-wasm`, `build-wasm-threads`, `build-wasm-threads-dbg`) match spec.
- `bootstrap.sh` Node floor is 22.0.0 (line 18) — matches spec.
- `.emsdk-version` is `4.0.7`, pinned correctly.
- `build-images/src/Dockerfile` cleanly removes wasi-sdk and adds the emsdk install layer.
- `setup-container.sh` removes the wasi-sdk + legacy host-runtime sections (line 215-220 commentary) and installs emsdk pinned to `.emsdk-version`.
- The two new gtest tests (`pool_exhaustion.test.cpp`, `memory_growth.test.cpp`) are auto-discovered by `barretenberg_module()`'s glob and will produce a `wasm_threads_tests_tests` binary.
- The two new TS tests (`clean_shutdown.test.ts`, `reentry.test.ts`) match the jest `testRegex` and will be discovered by the runner.

---

## Files I read in this review

- `/workspace/barretenberg-claude/CODER_REPORT.md`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/toolchains/wasm-emscripten.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/threading.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/module.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/CMakePresets.json`
- `/workspace/barretenberg-claude/barretenberg/cpp/scripts/wasm-run`
- `/workspace/barretenberg-claude/barretenberg/cpp/scripts/run_bench.sh`
- `/workspace/barretenberg-claude/barretenberg/cpp/scripts/benchmark_wasm_remote_wasmer.sh`
- `/workspace/barretenberg-claude/barretenberg/cpp/scripts/perf_baseline.json`
- `/workspace/barretenberg-claude/barretenberg/cpp/bootstrap.sh` (excerpt around `test_cmds_wasm_threads`)
- `/workspace/barretenberg-claude/barretenberg/cpp/src/CMakeLists.txt`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_env/CMakeLists.txt`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_env/wasm_init.cpp`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/CMakeLists.txt`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/pool_exhaustion.test.cpp`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/memory_growth.test.cpp`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp` (header check)
- `/workspace/barretenberg-claude/barretenberg/ts/package.json`
- `/workspace/barretenberg-claude/barretenberg/ts/scripts/copy_wasm.sh`
- `/workspace/barretenberg-claude/barretenberg/ts/scripts/browser_postprocess.sh`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/index.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/factory/node/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_base/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/fetch_code/node/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/helpers/node/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/clean_shutdown.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/clean_shutdown.harness.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/reentry.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/bb_backends/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/bb_backends/wasm.ts`
- `/workspace/barretenberg-claude/.github/workflows/wasm-emscripten.yml`
- `/workspace/barretenberg-claude/.emsdk-version`
- `/workspace/barretenberg-claude/bootstrap.sh` (relevant sections)
- `/workspace/barretenberg-claude/barretenberg/bootstrap.sh`
- `/workspace/barretenberg-claude/scripts/setup-container.sh` (relevant sections)
- `/workspace/barretenberg-claude/build-images/src/Dockerfile`
- `/workspace/barretenberg-claude/docs/network_versioned_docs/version-v4.2.0/operators/setup/building-from-source.md:301` (legacy ref)
