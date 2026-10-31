# aztec-acvm

The ACVM as an IPC service: solves compiled Noir (ACIR) programs to a witness, with every oracle
(Brillig foreign call) answered by the caller. One Rust crate (`rust/`) builds both a native binary,
`aztec-acvm`, and a wasm module, behind one generated TypeScript client, `@aztec-labs/acvm`: the
binary in node, the wasm module in browsers or wherever a process can't be spawned.

## Wire contracts

- `acvm_schema.jsonc`, the `Acvm` service: `ExecuteProgram` takes a program's bytecode and its main
  function's initial witness, and returns its return witness and, when asked, its solved witness and
  witness stack (msgpack, uncompressed: the form bb takes as a prover's witness). A program that fails
  to solve comes back as a `failure` on the response, with acvm_js's fields (message, call stack, raw
  assertion payload, function ids); a service error is a program that can't be read, or a foreign
  call that got no answer.
- `oracle_schema.jsonc`, the `Oracle` service: `ForeignCall` carries one Brillig foreign call, tagged
  with the `executionId` of the `ExecuteProgram` it belongs to, so one server can answer every
  caller's executions. The caller serves it; `@aztec-labs/acvm-oracle` is its generated server bindings.

## Oracles

The handler is the same in both builds; only where foreign calls go differs.

- Native: the binary is a client of an Oracle server, `aztec-acvm msgpack run --input <path>
  --oracle <path>`. Without `--oracle`, a program making a foreign call fails with a service error.
- wasm: the module calls its host's `oracle` host-call target (`hostCall: { oracle }` when creating
  the wasm backend). The host may answer asynchronously: JSPI suspends the module until it does.

```ts
const server = await UdsIpcServer.listen(oracleSocket, (_, request) => handleRequest(oracles, request));
const native = await AcvmService.create({ backend: 'process', process: { extraArgs: ['--oracle', oracleSocket] } });
const wasm = await AcvmService.create({ backend: 'wasm', wasm: { hostCall: { oracle: request => handleRequest(oracles, request) } } });
```

## Dependencies

Everything outside this directory comes from one aztec-packages release, pinned by tag in
`foundation.pin`: ipc-codegen from npm (`IPC_CODEGEN_DIR` points at a checkout's instead), and the
`ipc-runtime` crate from crates.io at the same version, which `rust/Cargo.toml` names and
`bootstrap.sh` checks. The noir crates (`acir`, `acvm`, `bn254_blackbox_solver`) come from crates.io at
the version that compiles the programs run here. The TypeScript runtime is portaled from this tree.

## Tests

- `rust/tests/execute.rs`: the executor against fixture programs (`rust/tests/programs`, compiled into
  `rust/tests/fixtures` by `regenerate.sh`), its witness stacks against the ones `nargo execute`
  writes.
- `rust/tests/process.rs`: the binary, spawned, with an Oracle server the test serves.
- `scripts/acvm.test.mjs`: the package, through the binary and the wasm module (on a worker and on the
  calling thread), with oracles answered asynchronously; every backend gives the same result.
