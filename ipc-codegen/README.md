# ipc-codegen

Schema-driven IPC code generator for **C++**, **TypeScript**, **Rust**, and **Zig**.

Given a JSON schema describing a service's commands and responses, emits matching
wire-type definitions plus a typed client and/or server-side dispatcher in the
target language. Wire format is msgpack; the actual byte transport
(Unix-domain socket or MPSC shared memory) is provided by
[`/ipc-runtime`](../ipc-runtime) — clients and servers in different languages
talk byte-compatibly because they all pack the same wire types.

## Quick start

```sh
cd ipc-codegen
./bootstrap.sh build   # generate echo example bindings, compile all 4 languages
./bootstrap.sh test    # run the cross-language wire-compat matrix
```

## How it fits together

```
                        ┌──────────────────┐
                        │   *_schema.json  │   (committed next to the C++ server
                        └────────┬─────────┘    that owns the wire format)
                                 │
                                 ▼
                        ┌──────────────────┐
                        │   ipc-codegen    │   (this package)
                        └────────┬─────────┘
                                 │
              ┌──────────┬───────┴───────┬──────────┐
              ▼          ▼               ▼          ▼
        wire types,  wire types,    wire types,  wire types,
        typed       typed          typed         typed
        client +    client +       client +      client +
        server      server         server        server
        (C++)       (TS)           (Rust)        (Zig)
              │          │               │          │
              └──────────┴────────┬──────┴──────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │   ipc-runtime    │   (transport: UDS / MPSC-SHM,
                        └──────────────────┘    same path-suffix dispatch in
                                                every language)
```

ipc-codegen knows nothing about sockets, shared memory, or processes — it just
serialises typed commands to msgpack bytes and back. ipc-runtime knows nothing
about your service's commands — it just moves bytes. Consumers wire the two
together (codegen-emitted dispatcher on top of an ipc-runtime server, or
codegen-emitted typed client on top of an ipc-runtime client).

## Layout

```
ipc-codegen/
  bootstrap.sh           # build / test / update_goldens / hash
  src/                   # generator (TypeScript, runs under Node 22+)
    generate.ts            # CLI entry point
    schema_visitor.ts      # JSON schema -> CompiledSchema IR
    cpp_codegen.ts         # IR -> C++ output
    typescript_codegen.ts  # IR -> TypeScript output
    rust_codegen.ts        # IR -> Rust output
    zig_codegen.ts         # IR -> Zig output
    naming.ts              # snake_case / PascalCase helpers
  templates/             # static templates copied alongside generated code
    cpp/ipc_codegen/*.hpp   # C++ support headers copied into generated output
    rust/{backend,error,ffi_backend}.rs
    zig/{backend,ffi_backend}.zig
  echo_example/          # 4-language echo service (cross-lang test harness)
  SCHEMA_SPEC.md         # wire protocol and schema-format reference
```

The package contains no service schemas of its own. Each consumer owns and
commits its schema next to the C++ server that defines the wire format, and
invokes `generate.ts` with that local path.

## CLI: `src/generate.ts`

Invoked once per (schema, language) pair. Run directly with
`node --experimental-strip-types`, or via `bootstrap.sh`.

```
node --experimental-strip-types --experimental-transform-types --no-warnings \
  src/generate.ts --schema <file> --lang <ts|cpp|rust|zig> --out <dir> [flags]
```

### Required flags

| Flag | Purpose |
|---|---|
| `--schema <file>` | Path to the JSON schema. |
| `--lang <ts\|cpp\|rust\|zig>` | Target language. |
| `--out <dir>` | Output directory. Generated files are (re)written every run; static templates are copied alongside and re-copied only if missing (so handwritten edits to templated scaffolding are preserved). |

### Role flags

| Flag | Purpose |
|---|---|
| `--server` | Emit server dispatch (matches request name to handler, deserialises, calls handler, serialises response). Pair it with an `ipc::IpcServer` from ipc-runtime. |
| `--client` | Emit a typed client class/struct with one method per command. Pair it with an `ipc::IpcClient` (C++) or the equivalent Rust/Zig/TS binding. |
| `--uds` | Rust/Zig only. Copies the `Backend` trait template (and `error.rs` for Rust) into `<out>` so consumers can plug ipc-runtime — or any custom transport — behind the generated client. The flag name is historical: the trait is transport-agnostic. |
| `--ffi` | Rust/Zig only. Adds the `ffi_backend` template (a thin wrapper exposing the generated client over a C ABI for embedding in other languages). |

### Naming flags

| Flag | Purpose |
|---|---|
| `--prefix <Str>` | Type prefix applied to generated type names (`<Prefix>CircuitProve`, etc.). Auto-detected from the schema if omitted. |
| `--strip-method-prefix` | TS only. Drops the prefix from client *method* names: `bbCircuitProve()` → `circuitProve()`. Types keep the prefix. |

### C++-specific flags

| Flag | Purpose |
|---|---|
| `--cpp-namespace <ns>` | C++ namespace, e.g. `my::service`. Default: lowercased prefix. |
| `--cpp-wire-namespace <ns>` | Inner namespace for wire types, default `wire`. |
| `--cpp-include-dir <path>` | Include-path prefix for cross-includes between generated files, e.g. `myservice/generated`. Leave unset when generated files are in the same directory as their consumer. |

### Other

| Flag | Purpose |
|---|---|
| `--curve-constants` | TS only. Also emit `curve_constants.ts` with bn254/grumpkin/secp moduli & generators for schemas that need curve constants. |
| `--skeleton <dir>` | One-shot scaffolding: writes a `<service>_handlers.{ts,rs,zig,cpp}` stub, `main`, and a build file into `<dir>` if they don't already exist. Skipped on subsequent runs. |

## Worked examples

Paths below are illustrative — consumers commit their own schema next to the
C++ server that owns the wire format and supply absolute or relative paths on
the command line.

### TypeScript client, with curve constants

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.json \
  --lang ts \
  --out /path/to/output/generated \
  --client \
  --prefix MyService --strip-method-prefix --curve-constants
```

Produces `api_types.ts`, `async.ts`, `sync.ts`, `curve_constants.ts`. The TS
client uses `@aztec/ipc-runtime`'s `UdsIpcClient` or `NapiShmSyncClient` for
transport — no template copy.

### C++ server + client, under a project sub-include path

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.json \
  --lang cpp \
  --out /path/to/myservice/generated \
  --server --client \
  --cpp-namespace my::ns --prefix MyService \
  --cpp-include-dir myservice/generated
```

Produces `myservice_types.hpp`, `myservice_ipc_client.{hpp,cpp}`, and
`myservice_ipc_server.hpp`. Cross-includes use the supplied `--cpp-include-dir` prefix
(`#include "myservice/generated/myservice_types.hpp"`). Wire to an
`ipc::IpcServer` (from ipc-runtime) plus a hand-written
`<service>_handlers.cpp` that supplies one `handle_<method>(...)` per command.
Generated C++ includes support headers as `ipc_codegen/...`; the generator
copies those headers from `templates/cpp/ipc_codegen/` into the output
directory.

### Rust client + FFI backend

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.json \
  --lang rust \
  --out /path/to/crate/src/generated \
  --client --uds --ffi \
  --prefix MyService \
  --skeleton /path/to/crate/src
```

Produces `myservice_types.rs`, `myservice_client.rs`, plus `backend.rs`,
`error.rs`, `ffi_backend.rs`. UDS/SHM transport is provided by the
`ipc-runtime` Rust crate; the consumer chooses which to use via the path
suffix passed at runtime. The skeleton flag also writes a one-time
`myservice_handlers.rs`, `main.rs`, `Cargo.toml`, and `generate.sh` into the
skeleton dir so a new service crate is buildable on first run.

### Zig client + server

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.json \
  --lang zig \
  --out /path/to/output/generated \
  --server --client --uds --ffi \
  --prefix MyService
```

Produces `myservice_types.zig`, `myservice_client.zig`,
`myservice_server.zig`, plus `backend.zig` and `ffi_backend.zig`. Consumers
`@import("ipc_runtime")` for transport.

## Adding a new service

1. **Define the C++ command structs** in your service's `.hpp`, each with
   `MSGPACK_SCHEMA_NAME` and `SERIALIZATION_FIELDS(...)`. Group them into a
   single `Command` and `Response` `NamedUnion`.
2. **Snapshot the schema.** Build the service binary and run
   `<binary> msgpack schema` to dump the JSON. Commit it next to the C++
   source that defines it (e.g. alongside the `Command` / `Response`
   headers). This is the wire-format source of truth.
3. **Wire your consumer's build to invoke `src/generate.ts`** with the flags
   above, passing the absolute path to the committed schema and the desired
   output directory. Generated files go under a `generated/` directory which
   is gitignored by convention.
4. **Wire transport.** On the C++ server side, instantiate an
   `ipc::IpcServer` via `ipc::make_server(path)` (from ipc-runtime) and feed
   it the codegen-emitted `make_<prefix>_handler(...)`. On the client side
   (any language), point an `ipc::IpcClient` / equivalent at the same path
   and wrap it with the codegen-emitted client.
5. **Run `./bootstrap.sh test`** in `ipc-codegen/` to confirm the codegen and
   cross-language wire-compat tests still pass.

## Schemas are the source of truth

The JSON schema is the wire contract between client and server. Consumers
commit it next to the C++ server that defines the underlying
`SERIALIZATION_FIELDS`, so the file lives close to what it describes and
tracks with that code. Whenever a server-side command changes, refresh the
JSON snapshot by running `<binary> msgpack schema` against the rebuilt
binary and committing the diff. Diverged schemas are a CI failure (each
consumer is responsible for guarding its own snapshot).

Each generated file embeds a `SCHEMA_HASH` so callers can detect at
connection time that their bindings predate the server.

## Wire-format contract

`echo_example/schema/golden/*.msgpack` is a frozen set of byte-level
fixtures covering every relevant msgpack encoding boundary (variable-width
ints, fixstr/str8/str16, bin8/bin16, optional `Some`/`None`, empty
containers, multi-byte UTF-8). The per-language golden tests
(`echo_example/{rust,ts}/...`) both decode the fixtures and re-encode
round-trip — pinning down canonical msgpack output across implementations.

If you intentionally change the wire format, run
`./bootstrap.sh update_goldens` and review the diff. Any byte-level change
is a breaking change for external implementations of the schema.

See `SCHEMA_SPEC.md` for the wire protocol details.
