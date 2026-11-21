# aztec-acvm

The ACVM as an IPC service: solves compiled Noir (ACIR) programs to a witness, with every oracle
(Brillig foreign call) answered by the caller, and encodes and decodes their values by their ABI.
Between them, its commands cover what acvm_js and noirc_abi_wasm do for the PXE, so a runtime without
WebAssembly (React Native's Hermes) can run a PXE on the native library. One Rust crate (`rust/`) builds a native binary,
`aztec-acvm`, a native library, `libaztec_acvm.so`, and a wasm module, behind one generated TypeScript
client, `@aztec-labs/acvm`: the process or the library (napi) in node, the wasm module in browsers or
wherever neither can run.

## Wire contracts

- `acvm_schema.jsonc`, the `Acvm` service: `ExecuteProgram` takes a program's bytecode and its main
  function's initial witness, and returns its return witness and, when asked, its solved witness and
  witness stack (msgpack, uncompressed: the form bb takes as a prover's witness). A program that fails
  to solve comes back as a `failure` on the response, with acvm_js's fields (message, call stack, raw
  assertion payload, function ids); a service error is a program that can't be read, or a foreign
  call that got no answer. `AbiEncode`, `AbiDecode` and `DecodeAssertionPayload` are
  noirc_abi_wasm's encoder, over the JSON its bindings use; `CompressWitnessStack` and
  `DecompressWitnessStack` are acvm_js's, in the gzipped form nargo writes.
- `oracle_schema.jsonc`, the `Oracle` service: `ForeignCall` carries one Brillig foreign call, tagged
  with the `executionId` of the `ExecuteProgram` it belongs to, so one server can answer every
  caller's executions. The caller serves it; `@aztec-labs/acvm-oracle` is its generated server bindings.

## Oracles

The handler is the same in every build, and calls its host's `oracle` host-call target; each backend
binds it from `hostCall: { oracle }`, the same option for all three:

- process: ipc-runtime serves the target on a socket and starts the binary with
  `--host-call oracle=<path>`. Without it, a program making a foreign call fails with a service error.
- napi: ipc-runtime passes the library its host-call function (`acvm_ipc_ffi_set_host_call`); the
  instance's thread waits while the host answers.
- wasm: the module's `ipc_runtime.host_call` import. JSPI suspends the module while the host answers.

The host may answer asynchronously in all three.

```ts
const oracle = (request: Uint8Array) => handleRequest(oracles, request);
const acvm = await AcvmService.create({ backend: 'napi', napi: { hostCall: { oracle } } });
```

`AcvmServiceSync` runs the library or the module on the calling thread; its host calls must answer
synchronously.

## Dependencies

The package builds against this checkout's ipc-codegen and ipc-runtime (the `ipc-runtime` crate by
path, the TypeScript runtime portaled), and its noir crates (`acir`, `acvm`, `bn254_blackbox_solver`,
`noirc_abi`) by path from `noir/noir-repo`, the noir that compiles the programs run here. `noirc_abi`
is not published, so none of them come from crates.io.

## Tests

- `rust/tests/abi.rs`: the ABI commands against the fixture programs' ABIs, and witness stacks
  round-tripping in nargo's format.
- `rust/tests/execute.rs`: the executor against fixture programs (`rust/tests/programs`, compiled into
  `rust/tests/fixtures` by `regenerate.sh`), its witness stacks against the ones `nargo execute`
  writes.
- `rust/tests/process.rs`: the binary, spawned, reaching an Oracle server the test serves through
  `--host-call oracle=<path>`.
- `scripts/acvm.test.mjs`: the package, through the process, the library and the wasm module, with
  oracles answered asynchronously; every backend gives the same result, the synchronous ones included.
