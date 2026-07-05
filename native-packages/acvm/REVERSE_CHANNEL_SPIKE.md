# Reverse-channel (oracle / foreign-call) — design & findings

Status: **wasm path productionized.** The de-risking spike answered all three questions (below); the
wasm oracle path now ships — async backend, generated reverse channel, Asyncify build. This note is
kept as the design rationale a maintainer needs before touching the generator or the wasm build (the
Asyncify direct-call constraint is subtle and load-bearing).

Remaining (deliberately not done): native handler wiring is a future *option* — protocol circuits make
no foreign calls, so the native server has no resolver configured and errors if one is requested; the
outbound-client pattern is proven in `rust/tests/oracle_resolver.rs`. A typed oracle schema (vs the v1
opaque frame) is also deferred.

## What was proven

| Spike | Question | Result |
|---|---|---|
| 1a | Can Asyncify suspend our Rust wasm on a blocking host import, main-thread, no SAB? | **Yes** — unwind → async resolve → rewind → resume, verified on a bare probe. |
| 1b | Does the ACVM's return-based re-entrancy keep the hot path *uninstrumented*? | **Yes** — with scoped Asyncify only the driver frames are instrumented; `solve`, the Brillig interpreter, and Poseidon2/MSM/EC are exempt. |
| 0 | A repeatable single-foreign-call fixture. | `oracle_invert_program()` — borrowed from acvm's `inversion_brillig_oracle_equivalence`. |
| 2 | Outbound-service-client model, native. | **Yes** — `execute_acir` resolves the oracle via a blocking `IpcClient::call` to a separate resolver `IpcServer` over a second UDS. |
| 3 | Same, wasm, end-to-end, main-thread, no SAB, native parity. | **Yes** — witness **byte-identical** to native via the Asyncify host-proxy. |

### The gating measurement (Spike 1b / 3)

Scoped Asyncify pass:
```
wasm-opt -O2 --asyncify \
  --pass-arg=asyncify-imports@acvm_host.host_call \
  --pass-arg=asyncify-ignore-indirect
```

| | Default asyncify | **Scoped** |
|---|---|---|
| Functions instrumented | 1502 / 1873 | **5** |
| Interpreter / crypto instrumented | yes (85 via indirect conservatism) | **none** |
| Module size delta vs plain `-O2` | +4.3 MB | **+~5 KB** |
| Runtime overhead (trivial circuit, pessimistic) | — | **+1.3–2.7%** |

The 5 instrumented frames are exactly the direct chain from the FFI entry to the suspending import:
`ipc_ffi_entry → ffi_dispatch → execute_program → host_call_bytes → host_call`. Everything below
`solve()` is off the stack at the suspend point (the ACVM returns `RequiresForeignCall` *before* the
host call), so it is never instrumented. Overhead on a real (crypto-heavy) circuit is therefore far
below the trivial-circuit figure, which is dominated by per-call fixed cost.

## The one non-obvious constraint (and the codegen change it forced)

`asyncify-ignore-indirect` is what keeps the interpreter uninstrumented — but it makes Asyncify assume
**no `call_indirect` ever unwinds**. That is only sound if the *entire* suspend path uses **direct**
calls. Two indirect calls were originally on the path and had to be removed:

1. **The resolver closure.** `execute_acir` took `&mut dyn ForeignCallResolver` → the resolve call was
   `call_indirect`. Fixed by making it generic (`impl ForeignCallResolver`); monomorphization makes it
   a direct call. The abstraction is unchanged — still one backend-agnostic closure.
2. **The generated dispatch.** `dispatch`/`handle_request`/`ffi_dispatch` took `&mut dyn Handler` → the
   `handler.<command>()` call was a vtable `call_indirect`. Fixed in **ipc-codegen** by making them
   generic `<H: Handler + ?Sized>`. With a concrete handler the call monomorphizes to direct; a `dyn`
   caller (if any) still compiles. This is the load-bearing codegen change from this spike.

Symptom when this is wrong: the wasm unwinds once, then `RuntimeError: unreachable` on rewind (the
uninstrumented intermediate frames don't propagate the unwind). Verified both directions.

## Settled reverse-channel shape (the Spike 4 conclusion)

**The reverse channel is not a bespoke primitive — it is the existing client+backend abstraction pointed
outward.** "A service is a client of another service" = the generated `<Target>Api<B: Backend>` with a
backend chosen per host:

- **Native outbound:** `Backend = IpcClient` (a second connection to the resolver process; blocks — free,
  it's a separate process). Proven in `tests/oracle_resolver.rs`.
- **Wasm outbound:** `Backend = HostProxyBackend`, whose `call(bytes) -> bytes` routes through the
  `host_call` import; the JS host is the switchboard and forwards the opaque frame to the target
  service's backend. Blocking from Rust's view; Asyncify (→ JSPI later, drop-in) handles suspension.
  Proven in the `oracle_wasm.mjs` harness.

So the transport symmetry is: `IpcClient` is to native as `host_call`+Asyncify is to wasm. The schema
and handler never learn about suspension — no `resume`, no `SimulationHandle`; `host_call` is a blocking
`bytes -> bytes` import.

### Reverse primitive
```
host_call(target: u32, req_ptr, req_len, resp_ptr_out, resp_len_out)   // wasm import: opaque msgpack in -> out
```
`target` selects which outbound dependency the host routes to (acvm-sim has one, the oracle resolver).
The v1 payload is the raw serialized outbound frame (here `rmp(ForeignCallWaitInfo)` ->
`rmp(ForeignCallResult)`); native and wasm carry **byte-identical** payloads (verified). Typing the
oracle interface as its own schema is deferred.

### What ships (was: productionization spec)
A service declares `reverseChannel: true` in its schema. Then:
- **Rust (generated, `--server-ffi`):** the `host_call` import + `host_call_bytes(target, req)` in the
  server module, `#[cfg(target_arch = "wasm32")]` (the import only exists on wasm; native uses a real
  IPC client). Host module name is `<service>_host`. See `ipc-codegen` `generateReverseChannel`. The
  consumer calls `srv::host_call_bytes(...)` from its handler; nothing about suspension leaks in.
- **TS (`@aztec/ipc-runtime`):** `WasiAsyncBackend` — an `IpcClientAsync` wrapping the module with the
  Asyncify unwind/rewind driver + a `host_call` import routed to `onHostCall(target, req) =>
  Promise<bytes>`. Generic (not service-specific). Serializes overlapping calls; growable scratch.
- **TS package:** `createWasmBackendWithHost({ onHostCall })` — a thin wrapper naming the host module.
- **Bootstrap:** `build_wasm` runs the scoped Asyncify pass (`-O2 --asyncify
  --pass-arg=asyncify-imports@<host>.host_call --pass-arg=asyncify-ignore-indirect`).

The one piece deliberately not generated: injecting an outbound `<Target>Api` client into the handler
(native oracle wiring). Not needed yet — see the top-of-file status.

### Why the client API stays sync on native but goes async on wasm
JS cannot synchronously block on a promise without SharedArrayBuffer (ruled out). So the outermost wasm
call boundary is `async` (`AsyncApi`), even though *inside* the wasm every `host_call` is blocking. Native
stays fully sync. Both are generated from the same schema; only the backend differs.

## Exit criteria — assessment
- ✅ Asyncify overhead ≤ ~10% (measured +1.3–2.7%, pessimistic) **and** interpreter/crypto confirmed uninstrumented.
- ✅ Outbound-service-client model proven native + wasm, byte-identical witnesses.
- ✅ Uniform blocking-`host_call` ABI; `resume` absent from schema/handler.
- ✅ Fallback identified if Asyncify ever proves costly: JSPI is a drop-in swap (same blocking model).

**Go.** No blocker was found; the wasm path is now built out.

## Remaining spike scaffolding
- `#[doc(hidden)] pub fn oracle_invert_program()` in `rust/src/lib.rs` — a test fixture (a Brillig
  oracle circuit) used by the unit tests and `tests/oracle_resolver.rs`. Fine to keep; promote to a
  shared fixture if more oracle circuits are added.

(The Spike 1a `spike_asyncify` probe and the hand-written `host_call_bytes` are gone — the latter is
now generated. The bare-Asyncify probe and wire-format work lived in throwaway scratch harnesses.)
