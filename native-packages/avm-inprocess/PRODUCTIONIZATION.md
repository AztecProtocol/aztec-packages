# Productionizing the in-process TXE (Slice C spike → production)

This spike (branch `cl/txe-inprocess-spike`, draft PR #24642) proves the TXE can run the AVM and world
state in one process sharing a single `WorldState`, with zero `aztec-wsdb`/`bb-avm-sim` child processes, set
via `TXE_IN_PROCESS=1`. What follows is the gap between the spike and something shippable, in priority order.
The codegen generalization is the most *visible* item but not the riskiest.

## 1. Correctness the spike papered over (highest risk)

- **Concurrency model.** The spike disables the wsdb scheduler's inline fast path with an
  `wsdb_always_pending → 1` predicate, forcing every op through the locked dispatch-pool path. Reason:
  in-process, requests arrive on *multiple* threads (libuv workers driving `InProcessWsdb.call` + the AVM's
  worker thread), whereas the socket server's inline path assumes single-threaded reactor submission. The
  claim that the mutex-guarded `submit_read`/`submit_write` preserves per-fork ordering under concurrent
  callers is **argued but not tested under real concurrency** — the TXE is near-sequential per session, so the
  passing tests don't exercise it. Need: validate (or redesign) the arrival-order semantics under concurrent
  submission, and think through the thread budget — WorldState pool + dispatch pool + libuv pool + AVM worker
  coexisting, with the AVM worker *blocking* a libuv thread on `future.get()` while wsdb runs on its own pool
  (UV_THREADPOOL_SIZE interaction).
- **Lifetime / ownership.** The co-hosted AVM holds the wsdb handle as a **raw borrowed pointer**; safety
  rests on the session disposing the AVM before closing the world state (a convention, not enforced). Wrong
  order → use-after-free. Want shared ownership / refcount, or at least an assertion. Same for
  "`wsdb_destroy` must be called when idle" — currently unenforced.
- **Error propagation** across the FFI/TSFN boundary is lossy: a wsdb error mid-sim degrades to an empty
  response → generic `avm_call failed`, losing the original message/type.

## 2. Build / packaging / distribution (likely more work than the codegen)

- The addon is loaded via an `AVM_INPROCESS_NODE` **env var pointing at a dev build path**. Production needs
  it built, per-arch prebuilt, shipped in the npm packages, and discovered via `findNapiBinary` like
  `@aztec/native`.
- `native-packages/avm-inprocess/CMakeLists.txt` is a standalone spike build: it hardcodes the bb
  static-archive list from `build/lib` and borrows `node-addon-api` from `nodejs_module/node_modules`. Needs
  real integration into `bootstrap.sh`.
- Binary size + **whether this should be a separate addon at all**: `@aztec/native`'s `nodejs_module.node`
  already links lmdb/world-state. Co-linking `vm2_sim` + `WorldState` again may want to be *one* addon rather
  than two overlapping ones.
- Note: running a TXE test today needs the txe **esbuild bundle** (`node ./esbuild.config.mjs`), because the
  root `yarn build` (tsc) clobbers `dest/bin/index.js` with tsc output that does bare JSON imports Node 24
  rejects. The esbuild bundle inlines the JSON artifacts.

## 3. Codegen generalization (the flagged item)

Fold the hand-written `native-packages/avm-inprocess/src/in_process_avm.cpp` (the `ObjectWrap`s, the C
trampolines, the blocking-`ThreadSafeFunction` `host_call` bridge, the promise/future sync driver) into the
IPC codegen: given a service schema + FFI lib path, emit the NAPI wrapper. This is what makes the mechanism
reusable and is the path to the wasm backend later. Mechanical now that the pattern is proven — but only pays
off if the mechanism is reused (wasm, other services). If the goal is TXE-only, this can stay hand-written.

## 4. Config flow / rollout / measurement

- `TXESynchronizer.createInProcess()` hardcodes 256 MB map sizes, `threads=1`, and `EMPTY_GENESIS_DATA`
  (duplicating `NativeWorldStateService.tmp()`). Non-empty genesis (prefilled public data) is wired through
  `buildInProcessWsdbOptions` but **never tested** in-process.
- Full TXE suite green in-process; CI wiring; decide whether `TXE_IN_PROCESS` becomes the default.
- **Measure the win** — the whole motivation was the per-session process/thread explosion. Capture
  before/after resource numbers (process tree + thread counts).

## Priority

1. Concurrency model + lifetime safety (correctness — cheapest to get wrong; the spike dodged it).
2. Build/packaging so it ships without an env var.
3. Codegen generalization.
4. Config flow, full-suite CI, resource measurement.

If the target is narrower ("just make the TXE lighter", TXE-only, not a general capability), then #1 and #2
are the must-haves, #3 can stay a hand-written addon. Worth deciding scope before investing in #3 — it's the
largest and only pays off if the mechanism is reused.
