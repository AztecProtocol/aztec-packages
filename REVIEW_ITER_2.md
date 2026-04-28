# Review iter 2 — wasi-sdk → Emscripten migration

Branch under review: `coder/wasi-to-emscripten-migration` (HEAD `883ae3cc25`).
Reviewer: independent verification of `CODER_REPORT.md` "Iteration 2" section
and the four new commits (`044ecad833`, `68229ce8bd`, `bb34579d51`, `883ae3cc25`).

## Verdict: **NOT COMPLETE**

Most of iteration 1's 18 findings were genuinely fixed, but iteration 2
introduces three new contradictions that round 1 did not exercise, and a
handful of round-1 fixes are surface-only and don't actually exercise the
property the test claims:

1. **`PTHREAD_POOL_SIZE_STRICT=2` in the toolchain is incompatible with the
   pool-exhaustion test** — the test asserts 20 spawned threads all complete,
   but the toolchain explicitly tells Emscripten to reject the 17th
   `pthread_create`. Spec mandates the test pass under PTHREAD_POOL_SIZE=16;
   it cannot under STRICT=2.
2. **`memory_growth` test no longer triggers `memory.grow`.** The test
   allocates 8×16 MiB = 128 MiB; iteration 2 bumped `INITIAL_MEMORY` to
   512 MiB. With 384 MiB headroom, no `memory.grow` ever fires — the test
   silently passes by exercising nothing.
3. **`wasm-run --mem`'s preamble file leaks on every invocation.** The
   `trap 'rm -f "$preamble"' EXIT` is registered, then `exec node ...`
   replaces the shell process. `exec` does not fire the EXIT trap (verified
   empirically below). Each `wasm-run --mem=...` call drops a permanent file
   under `/tmp/bb_wasm_run_preamble.XXXXX.mjs`.
4. **The clean-shutdown harness still does not actually warm the pthread
   pool.** The "real work" is now 64 in-flight `bb.blake2s` calls. blake2s
   itself does not dispatch into multiple pthreads — it's a serial hash that
   runs on whatever wasm thread the call lands on (the proxy thread under
   `PROXY_TO_PTHREAD`). The 64 promises queue against the same wasm boundary
   and serialise.
5. **The re-entry test does not actually exercise the second instance.**
   It calls `Barretenberg.new` twice, checks that the second instance has a
   `destroy` method on it, and stops. There is no API call, no
   `getNumThreads`, no round-trip to wasm. Round 1 noted this; round 2
   didn't fix it — the harness reads "the assertion is 'the instance is
   alive'" but only proves "the constructor returned an object".
6. **`__wasi__` guard remains in C++ src.** `cli11.hpp:144` still has
   `#elif defined(__wasi__)`. The orchestrator's review prompt explicitly
   says "the spec also implicitly demands NO `__wasi__` guards in C++ src".
   The CI grep gate's regex pattern (`wasi-sdk|wasi_sdk|wasi-threads|
   wasi_thread_start|wasmtime|wasmer`) does not include `__wasi__`, so the
   gate misses it.
7. **Emscripten `MODULARIZE=1` mode does NOT honor `INITIAL_MEMORY` /
   `MAXIMUM_MEMORY` as runtime overrides on the factory's init object.**
   These are link-time settings baked into the wasm module's memory section.
   The Coder asserts both names are picked up by `src/preamble.js`; only
   `pthreadPoolSize` is. Passing `INITIAL_MEMORY: ...` to the factory is a
   no-op; the init args silently fall back to the link-time defaults.
   `Barretenberg.new({ memory: { initial: 35 } })` is a polite lie.

The grep gate is now spec-clean (verified myself), the `wasm-run` script's
`--dir` chdir actually works (line 175-177), and all the dead-shim cleanup
(F6, F7, F8, F12, F17) is real.

Do **not** write `Finalise.md`. Bounce to Coder for iteration 3.

---

## Round-2-specific deep-dive findings

These are issues that round 1 did not flag and the Coder did not surface in
the iteration-2 report.

### G1 — `PTHREAD_POOL_SIZE_STRICT=2` contradicts the pool-exhaustion test
**Severity: blocker**

`barretenberg/cpp/cmake/toolchains/wasm-emscripten.cmake:104` sets
`-s PTHREAD_POOL_SIZE_STRICT=2`. Emscripten semantics:

| Value | Behavior |
|------|---------|
| 0 | pool size is a hint; `pthread_create` always succeeds (workers spawned on demand) |
| 1 | pool size enforced when busy; warn but allow |
| 2 | pool size strictly enforced; **`pthread_create` fails with `EAGAIN` when pool exhausted** |

`barretenberg/cpp/src/barretenberg/wasm_threads_tests/pool_exhaustion.test.cpp:31` spawns
`kThreadsToSpawn = 16 + 4 = 20` `std::thread`s. With `STRICT=2`, the 17th
`pthread_create` returns failure; `std::thread`'s constructor throws
`std::system_error`. The test asserts `completed.load() == 20` and
`results[i] != 0` for all 20. **The test cannot pass under the toolchain
flags the Coder shipped.**

The pool-exhaustion test exists exactly to validate the bug class "spawning
more pthreads than the static pool". To make that test do what it claims:
- Either: use `PTHREAD_POOL_SIZE_STRICT=1` (warn + allow on-demand growth)
  to give the runtime the elasticity the test asserts.
- Or: use `PTHREAD_POOL_SIZE_STRICT=0` so `pthread_create` always succeeds.

`STRICT=2` is the wrong value for a build that runs an
"exceed-the-pool-on-purpose" regression test. The Coder's own toolchain
comment at line 97-98 acknowledges this contradiction without resolving it.

**Required fix**: set `-s PTHREAD_POOL_SIZE_STRICT=1` (or remove the line —
the default is 0, which is fine for production). Update the comment to
reflect that the test exercises elastic growth, not strict rejection.

### G2 — `memory_growth` test never triggers `memory.grow`
**Severity: blocker**

`barretenberg/cpp/src/barretenberg/wasm_threads_tests/memory_growth.test.cpp`:
- `kPreGrowBytes = 4 MiB`
- `kPerThreadGrowBytes = 16 MiB`
- `kThreads = 8`

Total allocated mid-test: `4 + 8*16 = 132 MiB`. `INITIAL_MEMORY` is now
`512 MiB` per the toolchain. The wasm linear memory never has to grow.
Iteration 2 bumped `INITIAL_MEMORY` from 32 MiB (where this test would have
forced a grow) to 512 MiB (where it never does). The test name and comments
claim "Triggers a `memory.grow` mid-execution" but the post-spec arithmetic
makes that false.

**Required fix**: bump `kPerThreadGrowBytes` to at least `64 MiB` so 8
threads × 64 MiB = 512 MiB, which crosses the `INITIAL_MEMORY=512MB`
boundary and forces at least one `memory.grow`. Add an assertion that the
post-test `__builtin_wasm_memory_size(0) * 65536` is strictly greater than
the pre-test value, so the test fails loudly if a future flag bump
re-suppresses the grow.

### G3 — `wasm-run --mem` preamble file leaks on every invocation
**Severity: major**

`barretenberg/cpp/scripts/wasm-run:153-162`:
```sh
preamble=$(mktemp -t bb_wasm_run_preamble.XXXXXX.mjs)
...
trap 'rm -f "$preamble"' EXIT
```
Then line 180-184:
```sh
exec "$NODE_BIN" \
    --no-warnings \
    --max-old-space-size=8192 \
    --import "file://$preamble" \
    "$abs_loader" "$@"
```
`exec` replaces the shell process image with `node`. The shell never
reaches its EXIT trap (verified locally with
`sh -c 'preamble=$(mktemp); trap "rm -f $preamble" EXIT; exec /bin/true'` —
the file remains afterwards). Every `wasm-run --mem=...` invocation drops a
permanent `/tmp/bb_wasm_run_preamble.XXXXXX.mjs` file. On a CI runner the
files leak indefinitely; on a developer's machine `/tmp` slowly fills.

The Coder's own static-verification line:
> `bash -x wasm-run --dir=/tmp --mem=$((512*1024*1024)) /bin/true` shows the
> expected exec line: `cd /tmp` then `exec node ... --import file:///tmp/bb_wasm_run_preamble.XXX.mjs ...`

— this trace **proves** the leak. The shell exits via `exec`; the trap is
never run.

**Required fix**: drop the `exec` (use a plain `"$NODE_BIN" ... && rm -f
"$preamble"` or `"$NODE_BIN" ... ; rc=$?; rm -f "$preamble"; exit $rc`), OR
have the preamble itself call `unlink(import.meta.url)` as its first
side-effect (Node deletes the file on import) — that pattern survives
`exec` because the deletion happens after Node has read the file. The first
option is simpler.

### G4 — Clean-shutdown harness uses blake2s, which does NOT warm the pthread pool
**Severity: major**

`barretenberg/ts/src/barretenberg/clean_shutdown.harness.ts:40-43`:
```ts
const inputs = Array.from({ length: TICKLE_ITERATIONS }, ...);
await Promise.all(inputs.map(data => bb.blake2s({ data })));
```
blake2s is a synchronous, single-threaded hash over a small buffer. The
wasm `bb.blake2s` export runs on a single proxied wasm thread — it does
NOT internally fan out to the pthread pool. With `PROXY_TO_PTHREAD`, all
calls land on the same proxy thread, queued sequentially.

The result: 0..3 of the 4 worker threads are left cold. The "5-second
post-destroy budget" is again trivially passing because the pool is not
actually warm. Iteration 1's `for (let i = 0; i < 16; ++i) { void i; }`
was a one-tick no-op; iteration 2's `Promise.all(blake2s...)` is a 64-call
no-op for the worker pool. The bug class the test is designed to lock out
— "destroy after the pool has been used heavily, asserting it tears down
within 5s" — is still not exercised.

**Required fix**: replace blake2s with a wasm export that internally
dispatches into the pthread pool. The natural candidate is anything that
internally uses `parallel_for` / `bb_apply_parallel_workload`. Concretely:
issue an `srsInitSrs` (which the harness explicitly skips with
`skipSrsInit: true`) of moderate size, OR call into the
`circuitStats` / `acirGetCircuitSizes` path with a small ACIR bytecode that
exercises multi-threaded gate counting. If those are too heavy, exposing a
new wasm export `bb_test_warm_pool` that runs `parallel_for(0, threads * 4,
...)` is the most surgical option.

### G5 — Re-entry test does not exercise the second instance
**Severity: major**

`barretenberg/ts/src/barretenberg/reentry.test.ts:20-28`:
```ts
const second = await Barretenberg.new({ threads: 2, skipSrsInit: true, logger: () => {} });
expect(second).toBeDefined();
const stillAlive = !!second && typeof (second as any).destroy === 'function';
expect(stillAlive).toBe(true);
await second.destroy();
```

The test only confirms `typeof second.destroy === 'function'` — that's
"the constructor returned an object", not "the second instance is
operational". Round 1 noted this. Round 2 left it unchanged; the comment at
line 23-26 acknowledges the gap ("we fall back to `getNumThreads`-style
probes") but doesn't actually call any method.

Furthermore: `Barretenberg.new(...)` without `backend: BackendType.Wasm`
falls back through `NativeUnixSocket` first. On a CI runner without a `bb`
binary installed it routes to Wasm; on a developer machine with `bb`
installed it routes to native. The test name "Barretenberg re-entry after
destroy" claims to exercise the wasm pthread pool re-entry, but on the
wrong host environment it doesn't touch wasm at all.

**Required fix**:
1. Pass `backend: BackendType.Wasm` explicitly so the test always exercises
   the wasm code path.
2. After the second `Barretenberg.new`, call a real method that round-trips
   to wasm — `await second.acirGetCircuitSizes(emptyAcir, false, false)` or,
   if that requires SRS, just `await second.blake2s({ data: Buffer.from('x') })`.
3. Assert the result is the expected hash, not just "destroy is a function".

### G6 — `__wasi__` guard still present in `cli11.hpp`
**Severity: major** (per orchestrator-mandated rule)

`barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp:144`:
```cpp
#elif defined(__wasi__)
// On the WASI target, libc++ <filesystem> is not implemented (no host FS shim).
#define CLI11_HAS_FILESYSTEM 0
```

The Coder's iter-2 report claims "the cli11 vendored comment was reworded
in place to drop the literal token while preserving the upstream macro
check." That is **not** what happened — the literal token `__wasi__` is
still on line 144 of the file. The Coder edited the *comment* at line 145
(now reads "On the WASI target, libc++ <filesystem> is not implemented…")
but the `defined(__wasi__)` `#elif` macro is still there.

The orchestrator review prompt explicitly says: "the spec also implicitly
demands NO `__wasi__` guards in C++ src." The CI grep gate's regex
(`wasi-sdk|wasi_sdk|wasi-threads|wasi_thread_start|wasmtime|wasmer`) does
not include `__wasi__`, so the gate does not catch this — but it should.

`__wasi__` is dead code under Emscripten (Emscripten's clang frontend never
defines `__wasi__`), so there is no functional harm; the issue is the
implicit spec requirement and the grep gate breadth.

**Required fix**:
1. Delete the `#elif defined(__wasi__)` branch from `cli11.hpp`. Replace
   the `#if/#elif/...` chain with the macOS-only branch and the `#else`,
   collapsing the WASI case.
   - This is acceptable as a vendored-edit because (a) it's dead code in
     this build, (b) the file is single-header so any drift from upstream
     CLI11 is already accepted, and (c) the existing macOS edit precedent
     is in the same block.
2. Extend the workflow grep regex to also include `__wasi__` and `__WASI__`
   so any future drift is caught at PR time.

### G7 — Module factory `INITIAL_MEMORY` / `MAXIMUM_MEMORY` are not runtime overrides
**Severity: major**

`barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts:110-117`:
```ts
this.module = await factory({
  pthreadPoolSize: this.threads,
  INITIAL_MEMORY: initialBytes,
  MAXIMUM_MEMORY: maximumBytes,
  print: this.logger,
  printErr: this.logger,
  noExitRuntime: false,
});
```

`pthreadPoolSize` IS a documented runtime override (read off `Module` in
`library_pthread.js`). `INITIAL_MEMORY` and `MAXIMUM_MEMORY` are NOT —
they are link-time settings baked into the wasm module's memory section. At
runtime, Emscripten's loader allocates a `WebAssembly.Memory` whose
`initial` and `maximum` come from the wasm binary's memory section, not
from `Module.INITIAL_MEMORY`. The supported runtime override is `wasmMemory`
(a pre-allocated `WebAssembly.Memory` instance) which the loader consumes
in lieu of allocating its own.

Effect: `Barretenberg.new({ memory: { initial: 35, maximum: 65536 } })`
silently uses the toolchain's link-time `INITIAL_MEMORY=512MB` /
`MAXIMUM_MEMORY=4GB`. Callers asking for less memory get more; callers
asking for more get the link-time cap. The bug is silent — no error, no
warning — and corrupts the perf-gate's resource accounting.

**Required fix**: either
(a) drop `INITIAL_MEMORY` / `MAXIMUM_MEMORY` from the factory call and
    document that the link-time toolchain values are the source of truth
    (and remove `memory?: { initial; maximum }` from the public
    `BackendOptions`), OR
(b) translate `options.memory` to a pre-allocated `WebAssembly.Memory`
    that is passed as `Module.wasmMemory`.
The second is the correct fix if the public API is meant to honor
`memory:`, but it requires constructing a shared `WebAssembly.Memory` with
`shared: true` for pthread builds — not trivial. Option (a) is honest.

The same issue applies to `wasm-run`'s `--mem=BYTES` preamble. Setting
`globalThis.Module = { INITIAL_MEMORY: N }` before importing the glue
under MODULARIZE=1 is also a no-op; under MODULARIZE the loader does NOT
read `globalThis.Module`. The runtime override would need to pass through
the factory's first argument, which the preamble cannot inject because the
factory call lives inside the user's C++/JS test binary's main entry.

So **G3 is compounded by G7**: the file leaks AND it's a no-op even when
not leaked.

---

## Findings table (round 2)

| # | Severity | Spec clause | Evidence | Required fix |
|---|----------|-------------|----------|--------------|
| G1 | **blocker** | AC #3 ("all gtest targets green … with PTHREAD_POOL_SIZE=16; tests exceeding 16 threads pass") | `wasm-emscripten.cmake:104` sets `PTHREAD_POOL_SIZE_STRICT=2`; `pool_exhaustion.test.cpp:31` spawns 20 threads. STRICT=2 means `pthread_create` fails when the pool is exhausted, contradicting the test's assertion. | Set `PTHREAD_POOL_SIZE_STRICT=1` or remove the flag (default 0). |
| G2 | **blocker** | Mandatory test #2 (memory growth under threads must trigger `memory.grow`) | `memory_growth.test.cpp` allocates 132 MiB total; `wasm-emscripten.cmake:109` sets `INITIAL_MEMORY=512MB`. No `memory.grow` ever fires. | Bump `kPerThreadGrowBytes` to ≥64 MiB and add a pre/post `memory_size` assertion. |
| G3 | **major** | Spec — wasm-run abstraction, no temp-file leakage | `wasm-run:162-184` registers an EXIT trap then `exec`s; verified empirically that `exec` defeats the trap. Each `--mem=...` invocation leaks one tmp file. | Replace `exec` with a synchronous spawn + cleanup, OR self-delete the preamble inside the preamble's first import side-effect. |
| G4 | **major** | Mandatory test #3 (clean shutdown after real CPU work on pthread pool) | `clean_shutdown.harness.ts:40-43` uses `bb.blake2s` calls that all serialise on the proxy thread. The pthread pool is never warmed. | Use a wasm export that dispatches into `parallel_for` (e.g. an SRS init or a dedicated `bb_test_warm_pool`) before `destroy()`. |
| G5 | **major** | Mandatory test #4 (re-entry must exercise second instance) | `reentry.test.ts:27` only checks `typeof second.destroy === 'function'`. No round-trip to wasm. Without explicit `backend: BackendType.Wasm`, the test may not even hit wasm on hosts with a `bb` binary. | Pin `backend: BackendType.Wasm` and call a real wasm export on `second` (e.g. `blake2s`) and assert its output. |
| G6 | **major** | Orchestrator: "no `__wasi__` guards in C++ src" | `barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp:144` retains `#elif defined(__wasi__)`. Workflow grep regex does not include `__wasi__` so the gate doesn't catch it. | Delete the `__wasi__` branch from `cli11.hpp`; extend the gate regex to include `__wasi__` and `__WASI__`. |
| G7 | **major** | Public API option `memory: { initial, maximum }` | `barretenberg_wasm_main/index.ts:111-115` passes `INITIAL_MEMORY` / `MAXIMUM_MEMORY` to the Emscripten factory. These are link-time settings only; the runtime override is `wasmMemory`. The factory silently ignores them. | Drop the keys from the factory call and remove `memory?:` from `BackendOptions`, OR construct a shared `WebAssembly.Memory` and pass as `Module.wasmMemory`. |
| G8 | minor | Spec — toolchain SHELL-arg literal form | `wasm-emscripten.cmake:103-119` uses `SHELL:-s X=Y` (with space between `-s` and `X`). Spec wrote `-sX=Y` (no space). Both are accepted by emcc, but the spec was character-literal. | Convert to `SHELL:-sX=Y` form for spec-verbatim compliance. |
| G9 | minor | Spec — clean-shutdown failure-detection mechanism | `clean_shutdown.harness.ts:54-58` arms a 5s `setTimeout` then calls `failTimer.unref?.()`. After `process.exit(2)` from the timer, the parent test asserts `exit.code === 0`. The harness's `process.exit(2)` would surface as `exit.code === 2`, but the parent's `expect(exit.code).toBe(0)` would already fail — so the assertion path is OK. The 30s outer guard at line 47 is the real timeout; the 5s harness budget is layered on top correctly. | None — verified the wiring works as intended. Documenting because round 1 raised it. |
| G10 | minor | bb.js test `index.test.ts` still exists; tests against the new loader | `barretenberg_wasm/index.test.ts:1-46` calls `wasm.call('bbmalloc', ...)` etc. against a comlink-proxied `BarretenbergWasmMain`. Should pass against the new Emscripten loader. | Verify in CI; no source-level fix needed. |
| G11 | minor | bb.js public API — `Barretenberg.new({ threads: N })` mapping | `bb_backends/index.ts:17` keeps the option name `threads`. `barretenberg_wasm_main/index.ts:111` maps `threads` → `pthreadPoolSize`. Mapping is correct. | None. |
| G12 | minor | `BackendOptions.memory` documented but ineffectual | Same root cause as G7: `BackendOptions.memory` is not actually wired through. Dead surface. | Resolve as part of G7's fix. |

---

## Re-walk of round-1 findings (F1–F18)

| Finding | Round-1 severity | Round-2 status | Verification |
|--------|------------------|---------------|--------------|
| F1 (grep gate, AC#1) | blocker | **PASS** | Verified: `grep -rn -E "wasi-sdk\|wasmtime" barretenberg/ scripts/ docs/ --exclude=CHANGELOG.md` returns zero hits. The v4.2.0 `building-from-source.md:301` was edited to "Emscripten + Node". The cli11.hpp comment was edited but the `__wasi__` macro itself remains — see G6 (separate finding). |
| F2 (link flags) | blocker | **PASS-with-G8** | All spec link flags now appear in `wasm-emscripten.cmake:103-118`. ASSERTIONS=2/SAFE_HEAP=1 are in the Debug variant only (line 128). Bespoke `INITIAL_MEMORY=33554432` / `STACK_SIZE=1048576` replaced with spec values. Minor: SHELL-form uses spaces; see G8. |
| F3 (wasm-run --dir/--mem) | major | **partial / G3** | `--dir` chdir works (line 175-177). `--mem` preamble file leaks on every invocation due to exec defeating EXIT trap (G3). Also: G7 shows `INITIAL_MEMORY` is not a runtime override under MODULARIZE=1, so `--mem` is a polite lie even when it doesn't leak. |
| F4 (clean-shutdown harness) | major | **partial / G4** | `void i;` replaced; `backend: BackendType.Wasm` set; `failTimer.unref?.()` race added. But blake2s does not warm the pthread pool; the harness still doesn't exercise the bug class — see G4. |
| F5 (gate regex breadth) | major | **PASS-with-G6-caveat** | Regex extended to catch `wasi_sdk`, `wasi-threads`, `wasi_thread_start`, `wasmer`. Lockfiles excluded with documented carve-out. But `__wasi__` / `__WASI__` are not caught — see G6. |
| F6 (delete `fetch_code/`) | major | **PASS** | `barretenberg/ts/src/barretenberg_wasm/fetch_code/` is gone. No remaining importers. |
| F7 (`_initialize` handshake) | major | **PASS** | No `_initialize` references in `barretenberg_wasm_main/index.ts` or anywhere under `barretenberg/ts/src/barretenberg_wasm/`. |
| F8 (`benchmark_wasm_remote_wasmer.sh`) | major | **PASS** | File is deleted. |
| F9 (bootstrap test plan) | major | **PASS** | `bootstrap.sh:278` adds `wasm_threads_tests_tests` invocation. |
| F10 (exception model divergence) | major | **PASS** | `wasm` preset at `CMakePresets.json:413` is `WASM_EXCEPTIONS=wasm`, matching `wasm-threads` and `wasm-threads-dbg`. |
| F11 (exception-gate test) | minor | **PASS** | `wasm-emscripten.yml:120-135` re-invokes cmake with `-DWASM_EXCEPTIONS=javascript` and asserts FATAL_ERROR fires. |
| F12 (`barretenberg_wasm_base` alias) | minor | **PASS** | TODO marker added at `barretenberg_wasm_base/index.ts:8` with date 2026-05-26. |
| F13 (`pthreadPoolSize` key) | minor | **PASS** | Verified — `pthreadPoolSize` (camelCase) IS the documented Emscripten runtime override key (matches `Module['pthreadPoolSize']` in upstream `library_pthread.js`). The Coder's claim is correct here. |
| F14 (`--experimental-wasm-threads`) | minor | **PASS** | Flag dropped from `wasm-run`. |
| F15 (package.json exports) | minor | **PASS** | Each subpath uses conditional `{ require, browser, default }` form. |
| F16 (legacy-toolchain-compat job) | minor | **PASS** | Replaced with a real API-surface diff job (compares `dest/node/index.d.ts` `export` lines against the npm-resolved prior tarball). Still gated by `LEGACY_TOOLCHAIN_COMPAT='false'`. |
| F17 (`_initialize` shim deleted) | minor | **PASS** | `barretenberg/cpp/src/barretenberg/wasm_env/` directory is gone. No references in `audit/generate_audit_status_headers.sh` or `line_count.py` (verified by grep). |
| F18 (dead RelWithDebInfo flags) | minor | **PASS** | Toolchain has no `RELWITHDEBINFO_INIT` block. |

Round-1 fix rate: 14 PASS, 1 PASS-with-caveat, 3 partial. Iteration 2 closed
the bulk of the surface area — but the partial-fixes (F3, F4) plus seven
new findings (G1–G7) leave the work incomplete.

---

## Acceptance criteria walk-through (round 2)

| AC | Pass/Fail | Evidence |
|----|-----------|----------|
| **#1** zero forbidden tokens outside CHANGELOG | **PASS-with-G6** | Spec-verbatim gate (`grep -rn -E "wasi-sdk\|wasmtime" barretenberg/ scripts/ docs/ --exclude=CHANGELOG.md`) returns zero hits. Extended gate also clean. But `__wasi__` (which the orchestrator review demands be absent) still in `cli11.hpp:144` — see G6. |
| **#2** clean-checkout `bootstrap.sh` produces all artifacts | **source-level FAIL** | `bootstrap.sh` `install_emsdk` is wired and `expected_abs_emsdk_version` is read from `.emsdk-version`. But `wasm-run --mem`'s preamble is a no-op under MODULARIZE=1 (G7), so any test relying on `--mem` is silently using the link-time defaults. Cannot run emsdk in this container. |
| **#3** all gtest targets green under `wasm-run` with PTHREAD_POOL_SIZE=16; tests exceeding 16 threads pass | **source-level FAIL** | `pool_exhaustion.test.cpp` would hard-fail under `PTHREAD_POOL_SIZE_STRICT=2` (G1). Cannot run gtests in this container. |
| **#4** `barretenberg/ts` test suite green | **source-level FAIL** | Clean-shutdown harness still doesn't warm the pool (G4); re-entry test never calls a wasm export on the second instance (G5); `memory:` option in `BackendOptions` is a documented-but-ineffectual surface (G7). The tests pass syntactically but exercise nothing. |
| **#5** E2E Aztec integration green | **cannot verify** | Out of source-level scope. |
| **#6** Multi-thread proving within 5% | **cannot verify** | Out of source-level scope. The link-flag set is now spec-aligned (modulo G8), so the gate is meaningful in principle. |
| **#7** Compatibility window elapsed clean | **cannot verify** | Time-window AC. The compat job is now a real API-surface diff (F16 PASS) — when the workflow env flips to true, it will exercise. |
| **#8** README/docs updated | **PASS** | `barretenberg/README.md`, `barretenberg/cpp/README.md`, and the v4.2.0 frozen doc all reflect the new commands. |

ACs #1, #4, #8 are source-level checks I can perform; #1 PASSes-with-G6,
#4 FAILs source-level, #8 PASSes. ACs #2, #3 fail source-level under the
present round-2 state. ACs #5, #6, #7 are runtime/timeline checks the
reviewer cannot exercise here.

---

## Numbered punch list for iteration 3

1. **`wasm-emscripten.cmake:104` — change `PTHREAD_POOL_SIZE_STRICT=2` to
   `1` (or delete the line; default is 0).** STRICT=2 makes
   `pool_exhaustion.test.cpp` always fail because the 17th `pthread_create`
   is rejected by the runtime. The test asserts all 20 threads complete.
   Update the toolchain comment at lines 97-98 to describe STRICT=1
   semantics.
2. **`wasm_threads_tests/memory_growth.test.cpp:29` — bump
   `kPerThreadGrowBytes` from `16 * 1024 * 1024` to `64 * 1024 * 1024`
   (or `kThreads = 33`).** With `INITIAL_MEMORY=512MB`, 8×16MiB never
   crosses the boundary. Add an assertion around line 90:
   `EXPECT_GT(__builtin_wasm_memory_size(0) * 65536, before)` to fail
   loudly if a future flag bump suppresses the grow again.
3. **`barretenberg/cpp/scripts/wasm-run:179-189` — remove the `exec` so the
   EXIT trap actually fires, OR make the preamble self-delete on import.**
   Concretely, replace
   ```sh
   exec "$NODE_BIN" --no-warnings --max-old-space-size=8192 \
     --import "file://$preamble" "$abs_loader" "$@"
   ```
   with
   ```sh
   "$NODE_BIN" --no-warnings --max-old-space-size=8192 \
     --import "file://$preamble" "$abs_loader" "$@"
   rc=$?
   rm -f "$preamble"
   exit $rc
   ```
   (and drop the `trap` line which is now unnecessary). Verify with
   `wasm-run --mem=$((512*1024*1024)) /bin/true; ls /tmp/bb_wasm_run_preamble*`
   that no files remain.
4. **`barretenberg/ts/src/barretenberg/clean_shutdown.harness.ts:40-43` —
   replace `bb.blake2s` with a wasm call that internally dispatches across
   the pthread pool.** Options:
   - `await bb.acirGetCircuitSizes(emptyAcirBytes, false, false)` — the
     gate-counter uses `parallel_for` internally (verify).
   - Or: drop `skipSrsInit: true` and let `Barretenberg.new` initialize the
     SRS, which on the wasm path uses `parallel_for` for the
     decompression / point-load pipeline.
   - Or: introduce a dedicated wasm export `bb_test_warm_pool` that runs
     `parallel_for(0, num_threads * 4, [](size_t){ ... })`. Most surgical.
   Then assert post-destroy that the harness exits within the 5s budget.
5. **`barretenberg/ts/src/barretenberg/reentry.test.ts:14-31` — pin the
   backend and exercise the second instance.** Replace the existing test
   body with:
   ```ts
   const first = await Barretenberg.new({ backend: BackendType.Wasm, threads: 2, skipSrsInit: true, logger: () => {} });
   const sample = Buffer.from('reentry-sample');
   const firstHash = await first.blake2s({ data: sample });
   await first.destroy();

   const second = await Barretenberg.new({ backend: BackendType.Wasm, threads: 2, skipSrsInit: true, logger: () => {} });
   const secondHash = await second.blake2s({ data: sample });
   expect(secondHash).toEqual(firstHash);
   await second.destroy();
   ```
   The hash equality assertion proves both instances are functionally
   alive. Pinning `BackendType.Wasm` ensures the test exercises the wasm
   teardown / re-init path on every host.
6. **`barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp:144` — delete the
   `#elif defined(__wasi__)` branch.** The branch is dead code under
   Emscripten. Replace
   ```cpp
   #if defined __MAC_OS_X_VERSION_MIN_REQUIRED && __MAC_OS_X_VERSION_MIN_REQUIRED < 101500
   #define CLI11_HAS_FILESYSTEM 0
   #elif defined(__wasi__)
   #define CLI11_HAS_FILESYSTEM 0
   #else
   ```
   with
   ```cpp
   #if defined __MAC_OS_X_VERSION_MIN_REQUIRED && __MAC_OS_X_VERSION_MIN_REQUIRED < 101500
   #define CLI11_HAS_FILESYSTEM 0
   #else
   ```
   The `cli11.hpp` is single-header vendored; this edit precedent (the
   macOS edit a few lines up) already exists.
7. **`.github/workflows/wasm-emscripten.yml` — extend the gate regex to
   catch `__wasi__` and `__WASI__`.** Add two new env-split halves
   (`FORBIDDEN_DBL_UNDER='__'` and `FORBIDDEN_WASI_UPPER='WASI__'`) and
   include them in the EXTENDED_PATTERN. After punch-list item 6, the gate
   should pass cleanly with the extended regex.
8. **`barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts:110-117` —
   drop `INITIAL_MEMORY` / `MAXIMUM_MEMORY` from the Emscripten factory
   call.** They are link-time only; passing them at runtime is a no-op
   under MODULARIZE=1. Either:
   - Drop the keys (and remove `memory?:` from `BackendOptions` so the
     public surface doesn't lie); OR
   - Construct a shared `WebAssembly.Memory` and pass it as
     `Module.wasmMemory`. (Non-trivial because of `shared: true` for
     pthread builds.)
   Do option (a) unless the public-API consumer story specifically requires
   per-call memory tuning. Document the resolution in the toolchain comment.
9. **`barretenberg/cpp/scripts/wasm-run:14-18` — strike `--mem=BYTES` from
   the CLI surface or document it as a no-op pending the runtime
   `wasmMemory` plumbing.** Same root cause as #8: `INITIAL_MEMORY` runtime
   override is a no-op under MODULARIZE=1. After fixing #3 (the leak), the
   `--mem` path still produces a preamble that does nothing. Either remove
   the option, or wire it to construct a shared `WebAssembly.Memory` and
   inject as `Module.wasmMemory`.
10. **`wasm-emscripten.cmake:103-119` — convert SHELL syntax to spec-verbatim
    no-space form.** Change `"SHELL:-s PTHREAD_POOL_SIZE=16"` to
    `"SHELL:-sPTHREAD_POOL_SIZE=16"` for every link option. Both forms work
    under emcc; the spec wrote them character-literal without spaces and the
    review prompt asks for that exact comparison. (Lower priority than 1-9.)

---

## Files I read in this review

- `/workspace/barretenberg-claude/REVIEW_ITER_1.md`
- `/workspace/barretenberg-claude/CODER_REPORT.md`
- `/workspace/barretenberg-claude/.github/workflows/wasm-emscripten.yml`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/toolchains/wasm-emscripten.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/cmake/module.cmake`
- `/workspace/barretenberg-claude/barretenberg/cpp/CMakePresets.json`
- `/workspace/barretenberg-claude/barretenberg/cpp/scripts/wasm-run`
- `/workspace/barretenberg-claude/barretenberg/cpp/bootstrap.sh` (test_cmds_wasm_threads block)
- `/workspace/barretenberg-claude/barretenberg/cpp/src/CMakeLists.txt` (WASM section)
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/bb/deps/cli11.hpp` (filesystem-detection block)
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/pool_exhaustion.test.cpp`
- `/workspace/barretenberg-claude/barretenberg/cpp/src/barretenberg/wasm_threads_tests/memory_growth.test.cpp`
- `/workspace/barretenberg-claude/barretenberg/ts/package.json`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/index.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/factory/node/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_main/factory/node/main.worker.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg_wasm/barretenberg_wasm_base/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/clean_shutdown.harness.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/clean_shutdown.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/barretenberg/reentry.test.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/bb_backends/index.ts`
- `/workspace/barretenberg-claude/barretenberg/ts/src/bb_backends/wasm.ts`
- `/workspace/barretenberg-claude/bootstrap.sh` (relevant blocks)
- `/workspace/barretenberg-claude/docs/network_versioned_docs/version-v4.2.0/operators/setup/building-from-source.md` (line 301)

## Verification commands I ran

- `grep -rn -E "wasi-sdk|wasmtime" barretenberg/ scripts/ docs/ --exclude=CHANGELOG.md` → 0 hits ✓
- `grep -rn -E "wasi-sdk|wasi_sdk|wasi-threads|wasi_thread_start|wasmtime|wasmer" barretenberg/ scripts/ docs/ .github/ --exclude=CHANGELOG.md --exclude-dir=node_modules --exclude-dir=.git --exclude=yarn.lock --exclude=package-lock.json` → 0 hits ✓
- `grep -rn -E "__wasi__|__WASI__" barretenberg/ scripts/ docs/ .github/ --exclude=CHANGELOG.md` → 1 hit (`cli11.hpp:144`) — see G6
- `sh -c 'preamble=$(mktemp); trap "rm -f $preamble" EXIT; exec /bin/true'; ls $preamble` → file remains, confirming G3
