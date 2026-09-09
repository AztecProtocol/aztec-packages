# ipc-codegen

Schema-driven IPC code generator for **C++**, **TypeScript**, **Rust**, and **Zig**.

Given a hand-authored JSONC schema describing a service's commands and
responses, emits matching wire-type definitions plus a typed client and/or
server-side dispatcher in the target language. The schema is the source of
truth — see `SCHEMA_SPEC.md` for its format. Wire format is msgpack; the actual byte transport
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
                        │  *_schema.jsonc  │   (hand-authored, committed next
                        └────────┬─────────┘    to the C++ server it describes)
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
    schema_visitor.ts      # friendly/positional schema -> CompiledSchema IR
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
commits its hand-authored schema next to the C++ server that implements the
service, and invokes `generate.ts` with that local path.

## CLI: `src/generate.ts`

Invoked once per (schema, language) pair. Run directly with
`node --experimental-strip-types`, or via `bootstrap.sh`.

```
node --experimental-strip-types --no-warnings \
  src/generate.ts --schema <file> --lang <ts|cpp|rust|zig> --out <dir> [flags]
```

### Required flags

| Flag | Purpose |
|---|---|
| `--schema <file>` | Path to the schema (JSON or JSONC; friendly or legacy positional form — see `SCHEMA_SPEC.md`). |
| `--lang <ts\|cpp\|rust\|zig>` | Target language. |
| `--out <dir>` | Output directory. Generated files are (re)written every run; static templates are copied alongside and re-copied only if missing (so handwritten edits to templated scaffolding are preserved). |

### Role flags

| Flag | Purpose |
|---|---|
| `--server` | Emit server dispatch (matches request name to handler, deserialises, calls handler, serialises response). Pair it with an `ipc::IpcServer` from ipc-runtime. |
| `--client` | Emit a typed client class/struct with one method per command. Pair it with an `ipc::IpcClient` (C++) or the equivalent Rust/Zig/TS binding. |
| `--package <dir>` | TS only. Emit a complete package shell. Which of the two shells you get depends on the role flags. With `--client` (or with neither role flag): a wrapper around the generated async client that launches a native service binary, connects over UDS or SHM, and resolves the binary from an override path, environment variable, installed arch package, or local `build/<platform>/` directory. With `--server` and no `--client`: a pure-TS server binding package instead, holding wire types, the `Handler` interface and `handleRequest`/`dispatch`, plus the schema file at the package root, with no binary launcher and no arch packages. The byte transport is then supplied by the consumer, e.g. `UdsIpcServer` from ipc-runtime. Passing `--server --client` selects the client shell. |
| `--uds` | Rust/Zig only. Copies the `Backend` trait template (and `error.rs` for Rust) into `<out>` so consumers can plug ipc-runtime — or any custom transport — behind the generated client. The flag name is historical: the trait is transport-agnostic. |
| `--ffi` | Rust/Zig only. Adds the `ffi_backend` template (a thin wrapper exposing the generated client over a C ABI for embedding in other languages). |

### Naming flags

Friendly-format schemas set naming via the schema's `service` field: generated
types are `<Service><Command>` and client methods are the bare command name. The
flags below are only for legacy positional schemas, which have no `service`.

| Flag | Purpose |
|---|---|
| `--prefix <Str>` | Positional schemas only. Type prefix applied to generated type names (`<Prefix>CircuitProve`, etc.). Auto-detected from the command names if omitted. Ignored when the schema declares `service`. |
| `--strip-method-prefix` | Positional schemas only. Drops the prefix from client *method* names: `bbCircuitProve()` → `circuitProve()`. Types keep the prefix. Implied when the schema declares `service`. |

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
| `--package-name <name>` | TS package mode only. Package name to write into the generated `package.json`. |
| `--binary-name <name>` | Client package shell only; ignored by the server shell. Native service binary name to launch. |
| `--binary-env-var <name>` | Client package shell only; ignored by the server shell. Environment variable that can override the binary path. Defaults to `<BINARY_NAME>_PATH`. |
| `--package-transports <uds,shm>` | Client package shell only; ignored by the server shell. Comma-separated transports supported by the generated wrapper. |
| `--ipc-runtime-dependency <spec>` | Client package shell only; ignored by the server shell. Dependency spec for `@aztec-foundation/ipc-runtime`, e.g. a release version or local `file:` dependency in examples. |

## Worked examples

Paths below are illustrative — consumers commit their own schema next to the
C++ server that owns the wire format and supply absolute or relative paths on
the command line.

### TypeScript client, with curve constants

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.jsonc \
  --lang ts \
  --out /path/to/output/generated \
  --client \
  --curve-constants
```

Produces `api_types.ts`, `async.ts`, `sync.ts`, `curve_constants.ts`. The TS
client uses `@aztec-foundation/ipc-runtime`'s `UdsIpcClient` or `NapiShmSyncClient` for
transport — no template copy.

### TypeScript spawned-service package

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.jsonc \
  --lang ts \
  --out /path/to/myservice/src/generated \
  --client \
  --package /path/to/myservice \
  --package-name @aztec/myservice \
  --binary-name myservice \
  --package-transports uds,shm
```

Produces the generated TS client under `src/generated/` plus a package shell
(`package.json`, `tsconfig.json`, `src/index.ts`, `src/platform.ts`, and
`scripts/prepare_arch_packages.sh`). The package exports a
`MyServiceService.spawn(...)` helper that launches the native binary and wraps
the generated async client. `scripts/prepare_arch_packages.sh` turns
`build/<platform>/<binary>` directories into per-architecture npm packages
matching the binary resolution path.

### C++ server + client, under a project sub-include path

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.jsonc \
  --lang cpp \
  --out /path/to/myservice/generated \
  --server --client \
  --cpp-namespace my::ns \
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
  --schema /path/to/myservice_schema.jsonc \
  --lang rust \
  --out /path/to/crate/src/generated \
  --client --uds --ffi \
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
  --schema /path/to/myservice_schema.jsonc \
  --lang zig \
  --out /path/to/output/generated \
  --server --client --uds --ffi
```

Produces `myservice_types.zig`, `myservice_client.zig`,
`myservice_server.zig`, plus `backend.zig` and `ffi_backend.zig`. Consumers
`@import("ipc_runtime")` for transport.

## Adding a new service

1. **Author the schema** as friendly JSONC (`service`, `types`, `error`,
   `commands`), and commit it next to the C++ server that will implement the
   service. This file is the wire-format source of truth — see `SCHEMA_SPEC.md`
   for the format. The C++ wire structs (`MSGPACK_SCHEMA_NAME` +
   `SERIALIZATION_FIELDS`) are generated from it, not hand-written.
2. **Wire your consumer's build to invoke `src/generate.ts`**, passing the
   absolute path to the committed schema and the desired output directory.
   Generated files go under a `generated/` directory which is gitignored by
   convention.
3. **Wire transport.** On the C++ server side, instantiate an
   `ipc::IpcServer` via `ipc::make_server(path)` (from ipc-runtime) and feed
   it the codegen-emitted `make_<prefix>_handler(...)`. On the client side
   (any language), point an `ipc::IpcClient` / equivalent at the same path
   and wrap it with the codegen-emitted client.
4. **Run `./bootstrap.sh test`** in `ipc-codegen/` to confirm the codegen and
   cross-language wire-compat tests still pass.

## Schemas are the source of truth

The JSONC schema is the wire contract between client and server. Consumers
commit it next to the C++ server that implements the service, so the file lives
close to what it describes and tracks with that code. Whenever the wire contract
changes, edit the schema, regenerate the bindings, and commit the diff. Both
sides regenerate from the same committed schema, so they stay byte-compatible.

Each generated file embeds a `SCHEMA_HASH` (a hash of the committed schema) so
callers can detect at connection time that their bindings predate the server.

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
