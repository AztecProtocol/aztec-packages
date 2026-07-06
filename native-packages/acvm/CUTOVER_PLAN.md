# acvm-sim → yarn-project cutover: status & plan

Living doc for replacing yarn-project's ACVM execution (`@aztec/noir-acvm_js` wasm + the per-circuit
`acvm` CLI spawn) with `@aztec/acvm-sim`. Companion to `REVERSE_CHANNEL_SPIKE.md` (design rationale for
the oracle/reverse-channel machinery).

## Where things are

- **PR #24525** — branch `cl/native-packages-acvm`, base `cl/wsdb-decouple`. Ships: the acvm-sim IPC
  service (msgpack, wraps the noir `acvm` crate), the wasm backend, the API-vs-backend codegen split,
  the reverse channel (oracles), and the productionized async wasm backend (`WasiAsyncBackend`,
  `createWasmBackendWithHost`, generated `host_call`, scoped Asyncify build).
- Worktrees: `acvm-sim` (this branch) and `avm-cutover` (`cl/ipc-5-avm-cutover`, lower in the stack —
  being iterated on separately).
- Nothing below is implemented yet — this is the plan.

## Goal

One `@aztec/acvm-sim` the codebase uses everywhere: native IPC on node, wasm in browser (eventually
auto-selected), and `@aztec/noir-acvm_js` retired. (`@aztec/noir-noirc_abi` stays — it's ABI
encode/decode, a separate concern.)

## Current yarn-project ACVM usage (as-is)

- `CircuitSimulator` interface (`simulator/src/private/circuit_simulator.ts`):
  - `executeProtocolCircuit(input, artifact, callback?)` → `ACVMSuccess { witness }`. No/optional
    foreign calls.
  - `executeUserCircuit(input, artifact, callback)` → `{ partialWitness, returnWitness }`. Foreign
    calls (oracles).
- `WASMSimulator` (`acvm_wasm.ts`) = `@aztec/noir-acvm_js`. Node **and** browser; both circuit kinds.
  PXE always uses this.
- `NativeACVMSimulator` (`acvm_native.ts`) = spawns the `acvm` **CLI per circuit** (temp dir + TOML in
  + gz witness file out). Protocol circuits only, **no foreign calls**. Constructed directly in
  `bb-prover/…/bb_prover.ts`, `prover-client/…/prover-client.ts`, and `prover-client/…/fixtures.ts`.
- **bb_prover witness handoff (important):** it builds `NativeACVMSimulator` with an
  `outputWitnessFile`, then `fs.readFile` + `ungzip` that file and passes the witness **bytes** to
  `bb.js` `instance.generateProof(circuitType, bytecode, vk, witness, flavor)`. **bb.js is a pure API
  — it takes the witness in memory; the `.gz` file is purely a legacy-CLI artifact** (a CLI's only
  output is a file). It also uses the in-memory witness map for `convertOutput`.

## Phased plan (each phase = its own PR, stacked on #24525)

### Phase 1 — native cutover  (mostly Rust; removes fs I/O from proving)
- **acvm-sim (Rust):** `ExecuteProgram` response returns the witness **both** as `WitnessEntry[]` (for
  `convertOutput`) **and** as a serialized `WitnessStack` blob (for `generateProof`). acvm-sim links
  the same `acir` crate → call `acir::native_types::WitnessStack::serialize()` → **byte-identical to
  what bb.js already accepts** (= today's `ungzip(partial-witness.gz)`). Unit-testable in Rust
  (serialize round-trip / compare to a known vector) — this de-risks the only scary part.
- **yarn-project (TS):** reimplement `NativeACVMSimulator` on a persistent `AcvmService`
  (`SpawnedBackend`, spawned once, not per-circuit). `bb_prover`/`prover-client`/`fixtures` drop the
  temp dir + `outputWitnessFile` + `fs.readFile` + `ungzip` and pass the returned bytes straight to
  `generateProof`. Witness conversion: `Map<number, 0x-hex>` ↔ `WitnessEntry[] {index, 32-byte}`.
- **Workspace wiring:** mirror the existing `@aztec/bb-avm-sim` `portal:` deps in the root
  `yarn-project/package.json` resolutions (5 entries incl. per-platform) + add `@aztec/acvm-sim` to
  `simulator/package.json`. (native-packages is **not** in the yarn-project workspace.)
- Note: `createSimulator`/`factory.ts` exists but has no real callers; the live construction is direct
  `new NativeACVMSimulator(...)` in the three files above (sync → async spawn is the change).
- Caveat: end-to-end untestable in this env (no yarn install); Rust part is testable, and full proof
  validation needs CI.

### Phase 2a — acvm-sim parity  (Rust, testable via `cargo test`)
- **returnWitness:** subset of the solved witness at `circuit.return_values` (a `BTreeSet<Witness>`);
  add `returnWitness` to the `ExecuteProgram` response schema.
- **structured errors:** capture assertion payload / call stack / brillig fn id from the ACVM error
  (mirror `acvm_js/src/js_execution_error.rs`); enrich the schema error type; `execute_acir` returns a
  structured error, not just `String`. Consumed by `enrichNoirError`/`extractCallStack`.
- **multi-function / `RequiresAcirCall`:** verify whether real protocol/user circuits need it before
  investing — most complex, possibly deferrable.

### Phase 2b — wasm cutover  (TS)
- Reimplement `WASMSimulator` on `createWasmBackendWithHost`. Foreign-call adapter: decode
  `rmp(ForeignCallWaitInfo)` → `(name, inputs)`, call the existing `ACIRCallback`, encode
  `ForeignCallResult`. Map structured errors into the shape `enrichNoirError` expects. Keep acvm_js as
  fallback until Phase 3.

### Phase 3 — auto-select + retire acvm_js  (NEEDS MORE THOUGHT — parked)
- Self-configuring `createAcvmBackend`: browser→wasm, node+binary→native, else wasm; custom-backend
  override (bb.js precedent; `findAcvmBinary` + optionalDependencies already exist).
- **Open question (parked):** native oracle resolver. Backend choice is partly **per-circuit-type**
  (oracle vs not), because native has no resolver configured today. Either encode "native for
  oracle-free programs, wasm-with-host otherwise" or wire native oracle resolution (inject an outbound
  resolver `IpcClient` into `AcvmHandler`). Decide before Phase 3.
- Then remove `@aztec/noir-acvm_js` deps.

## Key facts / gotchas
- `bb.js` `generateProof(circuitType, bytecode, vk, witness, flavor)` takes the witness as **in-memory
  bytes**. No files in bb.js.
- acvm-sim links `acir` → it can emit the witness in the exact format bb.js accepts via
  `WitnessStack::serialize()`. No JS reimplementation of the witness format.
- Asyncify `ignore-indirect` requires an all-direct suspend path; the generic `Handler` dispatch is
  what makes it hold (see `REVERSE_CHANNEL_SPIKE.md`).
- `@aztec/acvm-sim` is **not** in the yarn-project workspace; consume via `portal:` deps like
  `@aztec/bb-avm-sim`.
- Reverse-channel ABI: `host_call(target, req_ptr, req_len, resp_ptr_out, resp_len_out)`;
  `ORACLE_TARGET = 0`.

## Suggested PR order
1. Phase 2a (Rust parity) — independent, testable, base `cl/native-packages-acvm`.
2. Phase 1 (native cutover) — needs the serialized-witness output (fold into 2a or its own Rust bit).
3. Phase 2b (wasm cutover) — stacks on 2a; carries the workspace wiring if Phase 1 hasn't.
4. Phase 3 — after the native-resolver decision.
