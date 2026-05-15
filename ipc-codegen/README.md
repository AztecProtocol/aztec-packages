# ipc-codegen

Schema-driven IPC code generator for **C++**, **TypeScript**, **Rust**, and **Zig**.

Given a JSON schema describing a service's commands and responses, emits matching
type definitions plus a client and/or server in the target language. All wire I/O
is msgpack-over-UDS; languages talk to each other byte-compatibly.

## Quick start

```sh
cd ipc-codegen
./bootstrap.sh build   # generate echo example bindings, compile all 4 languages
./bootstrap.sh test    # run the 18-test cross-language wire-compat matrix
```

## Layout

```
ipc-codegen/
  bootstrap.sh           # build / test / update_goldens / hash
  schemas/               # committed JSON schemas (one per service)
    avm_schema.json
    bb_schema.json
    cdb_schema.json
    wsdb_schema.json
    bb_curve_constants.json
  src/                   # generator (TypeScript, runs under Node 22+)
    generate.ts            # CLI entry point
    schema_visitor.ts      # JSON schema -> CompiledSchema IR
    cpp_codegen.ts         # IR -> C++ output
    typescript_codegen.ts  # IR -> TypeScript output
    rust_codegen.ts        # IR -> Rust output
    zig_codegen.ts         # IR -> Zig output
    naming.ts              # snake_case / PascalCase helpers
  templates/             # static templates copied alongside generated code
    cpp/{ipc_client,ipc_server,msgpack_struct_map_impl}.hpp
    ts/{ipc_client,ipc_server}.ts
    rust/{backend,error,ipc_client,ipc_server,uds_backend,ffi_backend}.rs
    zig/{backend,uds_backend,ffi_backend,ipc_client,ipc_server,ffi_client}.zig
  scripts/
    update_schemas.sh    # refresh schemas/ from current C++ binaries
    validate_schemas.sh  # CI guard: schemas/ matches the binaries
  examples/              # 4-language echo service (test harness, see below)
  SCHEMA_SPEC.md         # wire protocol and schema-format reference
```

## CLI: `src/generate.ts`

Invoked once per (schema, language) pair. Run directly with `node --experimental-strip-types`, or via `bootstrap.sh`.

```
node --experimental-strip-types --experimental-transform-types --no-warnings \
  src/generate.ts --schema <file> --lang <ts|cpp|rust|zig> --out <dir> [flags]
```

### Required flags

| Flag | Purpose |
|---|---|
| `--schema <file>` | Path to the JSON schema. |
| `--lang <ts\|cpp\|rust\|zig>` | Target language. |
| `--out <dir>` | Output directory. Files are (re)written every run; static templates are copied alongside (and re-copied only if missing for one-time scaffolding files). |

### Role flags

| Flag | Purpose |
|---|---|
| `--server` | Emit server dispatch (matches request name to handler, deserializes, calls handler, serializes response). |
| `--client` | Emit a typed client class/struct with one method per command. |
| `--uds` | Include the Unix-domain-socket backend (Rust/Zig). |
| `--ffi` | Include the FFI backend (Rust/Zig). |

### Naming flags

| Flag | Purpose |
|---|---|
| `--prefix <Str>` | Type prefix applied to generated type names (`<Prefix>CircuitProve`, etc.). Auto-detected from the schema if omitted. |
| `--strip-method-prefix` | TS only. Drops the prefix from client *method* names: `bbCircuitProve()` → `circuitProve()`. Types keep the prefix. |

### C++-specific flags

| Flag | Purpose |
|---|---|
| `--cpp-namespace <ns>` | C++ namespace, e.g. `bb::wsdb`. Default: lowercased prefix. |
| `--cpp-wire-namespace <ns>` | Inner namespace for wire types, default `wire`. |
| `--cpp-include-dir <path>` | Include-path prefix for cross-includes between generated files, e.g. `barretenberg/wsdb/generated`. Leave unset when generated files are in the same directory as their consumer. |

### Other

| Flag | Purpose |
|---|---|
| `--curve-constants` | TS only. Also emit `curve_constants.ts` with bn254/grumpkin/secp moduli & generators (currently only used by bb). |
| `--skeleton <dir>` | One-shot scaffolding: writes a `<service>_handlers.{ts,rs,zig,cpp}` stub, `main`, and a build file into `<dir>` if they don't already exist. Skipped on subsequent runs. |

## Worked examples

Each invocation produces both the per-command type definitions and the role(s) you request.

### TypeScript client + server, with curve constants (bb)

```sh
src/generate.ts \
  --schema schemas/bb_schema.json \
  --lang ts \
  --out ../barretenberg/ts/src/cbind/generated \
  --server --client \
  --prefix Bb --strip-method-prefix --curve-constants
```

Produces `api_types.ts`, `async.ts`, `sync.ts`, `server.ts`, `ipc_client.ts` (template), `ipc_server.ts` (template), `curve_constants.ts`.

### C++ server (no client), under a barretenberg sub-include path (wsdb)

```sh
src/generate.ts \
  --schema schemas/wsdb_schema.json \
  --lang cpp \
  --out ../barretenberg/cpp/src/barretenberg/wsdb/generated \
  --server --client \
  --cpp-namespace bb::wsdb --prefix Wsdb \
  --cpp-include-dir barretenberg/wsdb/generated
```

Produces `wsdb_types.hpp`, `wsdb_ipc_client.{hpp,cpp}`, `wsdb_ipc_server.hpp`, plus the `ipc_client.hpp` / `ipc_server.hpp` / `msgpack_struct_map_impl.hpp` templates. Cross-includes use the supplied `--cpp-include-dir` prefix (`#include "barretenberg/wsdb/generated/wsdb_types.hpp"`).

### Rust UDS + FFI client (wsdb)

```sh
src/generate.ts \
  --schema schemas/wsdb_schema.json \
  --lang rust \
  --out src/generated \
  --server --client --uds --ffi \
  --prefix Wsdb \
  --skeleton src
```

Produces `wsdb_types.rs`, `wsdb_client.rs`, `wsdb_server.rs`, `ipc_server.rs` (template), plus the backend templates (`backend.rs`, `error.rs`, `uds_backend.rs`, `ffi_backend.rs`). The skeleton flag also writes a one-time `wsdb_handlers.rs`, `main.rs`, and `Cargo.toml` into `src/` so a new service crate is buildable on first run.

### Zig client + server (avm)

```sh
src/generate.ts \
  --schema schemas/avm_schema.json \
  --lang zig \
  --out src/generated \
  --server --client --uds --ffi \
  --prefix Avm
```

Produces `avm_types.zig`, `avm_client.zig`, `avm_server.zig`, plus backend templates.

## Adding a new service

1. **Define the C++ command structs** in your service's `.hpp`, each with `MSGPACK_SCHEMA_NAME` and `SERIALIZATION_FIELDS(...)`. Group them into a single `Command` and `Response` `NamedUnion`.
2. **Build the service binary** and run `./scripts/update_schemas.sh` — this calls `<binary> msgpack schema` and writes the JSON to `schemas/<service>_schema.json`. Commit the schema.
3. **Wire your consumer's `bootstrap.sh build` to invoke `src/generate.ts`** with the flags above. Generated files go under a `generated/` directory which is gitignored by convention.
4. **Run `./bootstrap.sh test`** in `ipc-codegen/` to confirm the codegen and cross-language wire compat tests still pass.

## Schemas are the source of truth

The JSON files under `schemas/` are checked in. They're what `generate.ts` consumes. They're produced from the C++ binaries via `./scripts/update_schemas.sh` whenever the underlying commands change. `validate_schemas.sh` is the CI guard that diffs the committed JSON against the current binaries — a stale schema is a CI failure, not a runtime surprise.

Each generated file embeds a `SCHEMA_HASH` so callers can detect at connection time that their bindings predate the server.

## Wire-format contract

`examples/echo-schema/golden/*.msgpack` is a frozen set of byte-level fixtures covering every relevant msgpack encoding boundary (variable-width ints, fixstr/str8/str16, bin8/bin16, optional `Some`/`None`, empty containers, multi-byte UTF-8). The per-language golden tests (`examples/{rust,ts}/echo/...`) both decode the fixtures and re-encode round-trip — pinning down canonical msgpack output across implementations.

If you intentionally change the wire format, run `./bootstrap.sh update_goldens` and review the diff. Any byte-level change is a breaking change for external implementations of the schema.

See `SCHEMA_SPEC.md` for the wire protocol details.
