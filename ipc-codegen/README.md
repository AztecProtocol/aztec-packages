# ipc-codegen

Schema-driven IPC code generator for **C++**, **TypeScript**, **Rust**, and **Zig**.

Given a hand-authored JSONC schema describing a service's commands and
responses, emits matching wire-type definitions plus a typed client and/or
server-side dispatcher in the target language. The schema is the source of
truth — see `SCHEMA_SPEC.md` for its format. Wire format is msgpack; the actual byte transport
(Unix-domain socket or MPSC shared memory) is provided by
[`/ipc-runtime`](../ipc-runtime) — clients and servers in different languages
talk byte-compatibly because they all pack the same wire types.

[`docs/where-a-service-runs.html`](docs/where-a-service-runs.html) explains, with diagrams, how one
service runs as a process, a native library or a wasm module, what an instance is in each, and which
thread runs it.

Published to npm as `@aztec-foundation/ipc-codegen`; the `ipc-codegen` bin runs the generator from
its TypeScript sources with Node's type stripping, so consumers outside this repository invoke it as
`node_modules/.bin/ipc-codegen --schema ... --lang ...` with the same flags as below.

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
| `--out <dir>` | Output directory. Generated files are (re)written every run; static templates are copied alongside and re-copied only if missing (so handwritten edits to templated scaffolding are preserved). Implied by `--package` (`<package>/src/generated`, where the package shell imports the bindings from). |

### Role flags

| Flag | Purpose |
|---|---|
| `--server` | Emit server dispatch (matches request name to handler, deserialises, calls handler, serialises response). Pair it with an `ipc::IpcServer` from ipc-runtime. |
| `--client` | Emit the typed client: one method per command over a byte backend, the same shape in every language — `<Service>Api<B: Backend>` (Rust), `<Service>Api<ipc_codegen::Backend B>` (C++), `Client(Backend)` (Zig), `AsyncApi`/`SyncApi` over `IpcClientAsync`/`IpcClientSync` (TS). A backend takes the msgpack request bytes and returns the response bytes: ipc-runtime's transport (C++: `ipc_codegen::IpcBackend`), the service in-process (`--ffi`), or your own. |
| `--package <dir>` | TS only. Emit a complete client package: the generated API over every backend the package has (`--package-transports`), with a `<Service>Service.create(options)` that picks one by default (the first of the spawned process, the napi library and the wasm module that is available, falling back along that order), can be forced to one, or takes a backend object of the consumer's own; one entry per host (node, `browser`, `react-native`) so each host sees only the backends that exist there; the binary resolved from an override path, an environment variable, or the installed per-platform arch package (this package's optional dependencies). With `--server` and no `--client`: a pure-TS server binding package instead, holding wire types, the `Handler` interface and `handleRequest`/`dispatch`, plus the schema file at the package root, with no binary launcher and no arch packages. The byte transport is then supplied by the consumer, e.g. `UdsIpcServer` from ipc-runtime. |
| `--ffi` | In-process FFI, both directions of the contract in `SCHEMA_SPEC.md` ("FFI"). With `--client` (Rust/Zig/C++): generates the FFI backend (`ffi_backend.{rs,zig}`, `<service>_ffi_backend.hpp`), which makes an instance of a linked library's service (`<service>_ipc_ffi_create`) and calls it. With `--server` (Rust/Zig/C++): emits the exports themselves — `<service>_ffi.rs` with an `export_<service>_ffi!` macro over a `Handler + Default` type, `<service>_ffi.zig` with `exportFfi(Handler)` over a default-initialised handler, or `<service>_ffi.{hpp,cpp}` defining `<service>_ipc_ffi_create`/`_call`/`_destroy`/`_alloc`/`_free` over the generated dispatch (the service defines `make_service()`, the one factory the generated `serve()` also runs). Each example's FFI test runs the generated client over the FFI backend against its own exports, in-process. The service prefix on the symbols lets several services be linked into one binary. A wasm reactor built from these is what the TS `wasm` transport runs. |
| `--package-transports <t>` | TS `--package` only. Comma-separated transports the package offers: `uds`, `shm` (spawned process), `napi` (the service's shared library, run in-process in node through ipc-runtime's Node-API addon) and `wasm` (the service's wasm module, run in-process through `@aztec-foundation/ipc-runtime/wasm`; adds a browser entry). A package without `uds`/`shm` has no binary and no `bin`. |
| `--package-napi-library <file>`, `--package-napi-library-env-var <name>` | TS `napi` transport. File name of the shared library the owning project builds from the C++ `--ffi --server` output (it exports `<ffi-name>_ipc_ffi_create`, `_call`, `_destroy`, `_alloc` and `_free`, and needs no Node-API code) and ships in the arch packages (see `--package-native`), and the environment variable that overrides its path (default `<LIBRARY_STEM>_NAPI_PATH`). `@aztec-foundation/ipc-runtime`'s Node-API addon loads it with `dlopen`. A library is loaded once per process, and each napi backend makes an instance of the service of its own. |
| `--package-wasm-module <name>=<path>`, `--package-wasm-threads-module <name>=<path>` | TS `wasm` transport. The single-thread and threads builds at `<path>`, installed into the package's `wasm/` directory as `<name>`; at least one is required. Generation reads each module's memory import and records it in the package, since a host must create an imported memory matching it and JS cannot read it from a compiled module. |
| `--package-native <platform>=<path>`, `--package-native <platform>:<file>=<path>` | TS `--package` with a native transport. Copies a built native file into the per-platform package under `packages/<stem>-<platform>/`; repeat it for each platform and file. `<platform>` is `linux-x64`, `linux-arm64`, `darwin-x64` or `darwin-arm64`, or the build directory name (`amd64-linux`, `arm64-linux`, `amd64-macos`, `arm64-macos`). The bare form names the binary (the napi library in a package without one); `<file>` picks the library in a package with both. Every per-platform manifest is generated either way; a file not given is not shipped, and a copy an earlier run left is removed. |
| `--package-every-platform` | With `--package-native`: fail unless every platform is given every native file, which is what publishing all the per-platform packages requires. |
| `--package-wasm-wide-module <name>=<path>`, `--package-wasm-wide-threads-module <name>=<path>` | TS `wasm` transport. Optional wide-arithmetic builds of the two, installed the same way; the package runs one in place of its counterpart where the engine validates the wide-arithmetic proposal. |

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

### TypeScript client

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.jsonc \
  --lang ts \
  --out /path/to/output/generated \
  --client
```

Produces `api_types.ts`, `async.ts`, `sync.ts`. The TS
client uses `@aztec-foundation/ipc-runtime`'s `UdsIpcClient` or `NapiShmSyncClient` for
transport — no template copy.

### TypeScript spawned-service package

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.jsonc \
  --lang ts \
  --client \
  --package /path/to/myservice \
  --package-name @aztec/myservice \
  --binary-name myservice \
  --package-transports uds,shm
```

Produces the generated TS client under `src/generated/` (the package implies
`--out`) plus a package shell
(`package.json`, `tsconfig.json`, `src/index.ts`, `src/platform.ts`) and the
per-platform package manifests under `packages/`. The package exports
`MyServiceService.create(...)`, which wraps the generated async client around
the backend chosen for the host (a spawned process by default here; `spawn`
and `wasm` force one), plus `createBackend` for facades that wrap the API
themselves. Add `--package-native linux-x64=/path/to/myservice` (one per
platform built) to copy the binaries into those per-platform packages.

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

Produces `myservice_types.hpp`, `myservice_client.hpp`, `myservice_dispatch.hpp` and
`myservice_ipc_server.hpp`. Cross-includes use the supplied `--cpp-include-dir` prefix
(`#include "myservice/generated/myservice_types.hpp"`). The server side wires an
`ipc::IpcServer` (from ipc-runtime) to a hand-written
`<service>_handlers.cpp` that supplies one `handle_<method>(...)` per command. The
client is header-only, `MyServiceApi<B>`; over ipc-runtime it is
`MyServiceApi<ipc_codegen::IpcBackend> api(ipc_codegen::IpcBackend("/tmp/myservice.sock"))`
(`ipc_codegen/ipc_backend.hpp`, which links `ipc_runtime`), and with `--ffi` a
default-constructed `MyServiceApi<my::ns::FfiBackend>` calls the service linked in-process.
From a wasm module, `MyServiceApi<ipc_codegen::HostCallBackend>
api(ipc_codegen::HostCallBackend("myservice"))` (`ipc_codegen/host_call_backend.hpp`) calls
whatever the host binds to `myservice` through the `ipc_runtime.host_call` import (see
ipc-runtime's `hostCall` option). `ipc_codegen::AnyBackend` (`ipc_codegen/any_backend.hpp`)
holds any of these behind one type, for code built once for native and wasm binaries.
Generated C++ includes support headers as `ipc_codegen/...`; the generator
copies those headers from `templates/cpp/ipc_codegen/` into the output
directory.

### Rust client + FFI backend

```sh
src/generate.ts \
  --schema /path/to/myservice_schema.jsonc \
  --lang rust \
  --out /path/to/crate/src/generated \
  --client --ffi \
  --skeleton /path/to/crate/src
```

Produces `myservice_types.rs`, `myservice_client.rs` and `ffi_backend.rs`. What they run on comes
from the `ipc-runtime` crate, which the crate depends on: the `Backend` and `AsyncBackend` traits
(`ipc_runtime::backend`), the error type (`ipc_runtime::error`), host calls
(`ipc_runtime::host_call_backend`) and asynchronous instances (`ipc_runtime::async_host`), all pure
Rust; and, with its `sockets` feature (on by default, compiling ipc-runtime's C++), `IpcServer`,
`IpcClient` and `ipc_runtime::process_host_calls`. A wasm module or a mobile library depends on it
with `default-features = false`, so it needs no C++ toolchain. `MyServiceApi::new(HostCallBackend::new("myservice"))`
calls whatever the host binds to `myservice`, as the C++ `HostCallBackend` does: in a wasm module
through the `ipc_runtime.host_call` import (on wasm32 it needs the `libc` crate), in a native
library through the function its host passes to `<service>_ipc_ffi_set_host_call`, and in a server
process at the paths `--host-call name=path` names, once the process calls
`process_host_calls::route_host_calls(process_host_calls::host_call_args(&args)?)`. A server whose
handlers await their host calls (`AsyncHostCall`) is served with `process_host_calls::serve_async`
instead, which keeps taking requests while host calls are out, so a target that calls back into the
server is answered rather than deadlocking it. UDS/SHM transport is provided by the
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
  --server --client --ffi
```

Produces `myservice_types.zig`, `myservice_client.zig`,
`myservice_server.zig`, `myservice_ffi.zig` and `ffi_backend.zig`. The generated client imports
the `Backend` interface from ipc-runtime/zig's pure-Zig `ipc_backend` module, so the consumer's
build.zig adds that import. Consumers `@import("ipc_runtime")` for transport (`ipc_runtime.Client`
is a backend), or link a library exporting the service's FFI and use `Client(FfiBackend)` over
`FfiBackend.init()`, which needs only `ipc_backend`.

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
   (any language), build the codegen-emitted client over ipc-runtime's backend
   for the same path (C++: `ipc_codegen::IpcBackend(path)`).
4. **Run `./bootstrap.sh test`** in `ipc-codegen/` to confirm the codegen and
   cross-language wire-compat tests still pass.

## Schemas are the source of truth

The JSONC schema is the wire contract between client and server. Consumers
commit it next to the C++ server that implements the service, so the file lives
close to what it describes and tracks with that code. Whenever the wire contract
changes, edit the schema, regenerate the bindings, and commit the diff. Both
sides regenerate from the same committed schema, so they stay byte-compatible.

A schema may `imports` other schemas' aliases and types, so a type is written
once, and may `extends` another service's schema, becoming a strict superset of
its contract (see `SCHEMA_SPEC.md`). Code typed against a parent schema's
generated interface then accepts the client of any schema that extends it.

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
