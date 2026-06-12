# ipc-runtime

UDS + MPSC shared-memory transport library for IPC services.

ipc-runtime is the byte-moving layer underneath
[`/ipc-codegen`](../ipc-codegen). It exposes a small `IpcServer` /
`IpcClient` API that picks the right transport from the path you hand it —
`.sock` → Unix-domain socket, `.shm` → MPSC shared memory — so per-service
code never branches on transport.

The same C++ implementation is reused from Rust, TypeScript (Node.js) and
Zig via a tiny C ABI. Wire types travel as opaque byte arrays; the per-
language codegen output knows how to (de)serialise them.

## Quick start

```sh
cd ipc-runtime
./bootstrap.sh           # build C++ static lib + tests (default)
./bootstrap.sh test      # run C++ ipc_runtime_tests
```

Per-language bindings build standalone:

```sh
# Rust crate
cargo build -p ipc-runtime

# TypeScript package (publishes @aztec/ipc-runtime via file: link)
cd ts && yarn install --immutable && yarn build

# Zig binding (compiles the C++ sources itself; no prebuilt archive)
cd zig && zig build test
```

The Rust and Zig bindings each compile the C++ sources themselves (via the
`cc` crate / `zig build`), so there's no separately-built archive to ship
between them and ipc-runtime/cpp.

## Layout

```
ipc-runtime/
  bootstrap.sh           # build / test (C++ only)
  cpp/
    ipc_runtime/
      ipc_client.{hpp,cpp}        # abstract IpcClient + UDS implementation
      ipc_server.{hpp,cpp}        # abstract IpcServer + UDS implementation
      shm_client.hpp              # single-client SHM client
      shm_server.hpp              # single-client SHM server
      shm_common.hpp              # shared MPSC-SHM glue
      shm/                        # lock-free SPSC/MPSC ring buffer primitives
      serve_helper.{hpp,cpp}      # ipc::make_server / make_client (path-suffix dispatch)
      signal_handlers.{hpp,cpp}   # ipc::install_default_signal_handlers
      named_union.hpp             # NamedUnion (codegen-emitted Command/Response variants)
      schema.hpp                  # ipc::msgpack_schema_to_string (reflection helper)
      c_abi.{h,cpp}               # C ABI exported to Rust / Zig / NAPI
    CMakeLists.txt
  rust/
    src/lib.rs            # safe Rust wrapper over c_abi.h
    build.rs              # invokes cc to compile cpp/ sources
    Cargo.toml
  ts/
    src/
      index.ts            # re-exports of the surface below
      uds_client.ts       # UdsIpcClient (Node net.Socket)
      uds_server.ts       # UdsIpcServer
      shm_client.ts       # NapiShmSyncClient / NapiShmAsyncClient (NAPI bridge)
      types.ts            # IpcClientSync / IpcClientAsync interfaces
    package.json
  zig/
    src/main.zig          # Zig binding (Server.fromPath / Client.fromPath)
    src/smoke.zig         # in-process smoke test
    build.zig
```

The shared C ABI in `cpp/ipc_runtime/c_abi.h` is the single contract every
non-C++ binding implements. Adding a new language binding is "wrap that
header"; there is no separate cross-language IPC framing to learn.

## Transport selection

`ipc::make_server(path)` and `ipc::make_client(path)` pick the transport
from the path's suffix:

| Path suffix | Transport                  | Used by                              |
|-------------|----------------------------|--------------------------------------|
| `*.sock`    | Unix-domain socket         | Async local clients, CLI tools       |
| `*.shm`     | MPSC shared-memory rings   | Low-latency native clients           |

```cpp
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"

auto server = ipc::make_server(input_path);    // .sock or .shm
ipc::install_default_signal_handlers(*server); // SIGINT/SIGTERM → clean exit
server->listen();
server->run(make_service_handler(request_ctx)); // codegen-emitted dispatcher
```

UDS is the default; SHM is a sub-microsecond hot path for latency-sensitive
local clients (`shm/README.md` covers the ring-buffer internals).

The suffix helpers use MPSC-SHM for `.shm` because it supports multiple
client slots. If a service only ever needs one producer/client, the lower-level
`IpcServer::create_shm` / `IpcClient::create_shm` factories are also supported;
they use one request ring and one response ring directly. They are not selected
by path suffix to keep `.shm` behavior stable for multi-client services.

## API surface

### C++ (`cpp/ipc_runtime/`)

```cpp
namespace ipc {

class IpcClient {
public:
  static std::unique_ptr<IpcClient> create_socket(const std::string& socket_path);
  static std::unique_ptr<IpcClient> create_shm(const std::string& base_name);
  static std::unique_ptr<IpcClient> create_mpsc_shm(const std::string& base_name,
                                                    std::size_t client_id);

  virtual bool                       connect()                                            = 0;
  virtual bool                       send(const void* data, size_t len, uint64_t timeout_ns) = 0;
  virtual std::span<const uint8_t>   receive(uint64_t timeout_ns)                         = 0;
  virtual void                       release(size_t message_size)                         = 0;
  virtual void                       close()                                              = 0;
};

class IpcServer {
public:
  using Handler = std::function<std::vector<uint8_t>(int client_id, std::span<const uint8_t>)>;

  static std::unique_ptr<IpcServer> create_socket(const std::string& path, int max_clients);
  static std::unique_ptr<IpcServer> create_shm(const std::string& base_name,
                                               std::size_t request_ring_size  = 1 << 20,
                                               std::size_t response_ring_size = 1 << 20);
  static std::unique_ptr<IpcServer> create_mpsc_shm(const std::string& base_name,
                                                    std::size_t max_clients,
                                                    std::size_t request_ring_size  = 1 << 20,
                                                    std::size_t response_ring_size = 1 << 20);

  virtual bool listen()                                            = 0;
  virtual int  wait_for_data(uint64_t timeout_ns)                  = 0;
  virtual std::span<const uint8_t> receive(int client_id)          = 0;
  virtual void release(int client_id, size_t message_size)         = 0;
  virtual bool send(int client_id, const void* data, size_t len)   = 0;
  virtual void close()                                             = 0;
  virtual void request_shutdown();                                 // signal-safe
  virtual void run(Handler handler);                               // event loop
};

std::unique_ptr<IpcServer> make_server(const std::string& path, const ServerOptions& = {});
std::unique_ptr<IpcClient> make_client(const std::string& path, std::size_t shm_client_id = 0);

void install_default_signal_handlers(IpcServer& server);

} // namespace ipc
```

`receive` returns a zero-copy span (into the SHM ring or the socket's
internal buffer); the caller must follow it with `release(span.size())`
before the next `receive` on the same client. The `run()` event loop owns
that pattern so handlers just deal in whole messages.

A handler returning a zero-length vector skips the response — used by
fire-and-forget commands. To exit the loop cleanly, call
`request_shutdown()`; `install_default_signal_handlers` wires SIGINT/SIGTERM
to it so RAII destructors run normally.

### Rust (`rust/`, crate `ipc-runtime`)

```rust
let mut server = ipc_runtime::Server::from_path("/tmp/svc.sock")?;
server.listen()?;
server.install_default_signal_handlers();
server.run(|client_id, request| handle(client_id, request));

let mut client = ipc_runtime::Client::from_path("/tmp/svc.sock")?;
let response: Vec<u8> = client.call(&request_bytes)?;
```

`Server::from_path` / `Client::from_path` mirror the C++ helpers (suffix
dispatch). The Rust `Client::call(&[u8]) -> Result<Vec<u8>>` packages the
send + receive + release sequence into a single safe operation. For
multi-slot MPSC-SHM, use `Client::from_path_with_id(path, client_id)`. The
crate compiles the C++ sources via `build.rs` so there's no separate
linker hook for downstream Cargo users.

### TypeScript (`ts/`, published as `@aztec/ipc-runtime`)

Two transport-specific clients:

| Class                | Transport                  | Sync / Async                                                 |
|----------------------|----------------------------|--------------------------------------------------------------|
| `UdsIpcClient`       | Node `net.Socket`          | async only                                                   |
| `NapiShmSyncClient`  | MPSC-SHM via NAPI bridge   | sync                                                         |
| `NapiShmAsyncClient` | MPSC-SHM via NAPI bridge   | async (with a libuv worker pool to escape the JS main thread) |

`UdsIpcServer` is provided for in-process tests; production servers are in
C++.

### Zig (`zig/`)

`Server.fromPath(path)` / `Client.fromPath(path)` over the same C ABI; the
Zig `build.zig` compiles the C++ sources directly with the bundled clang +
libc++, so there's no archive shim.

## Wire framing

Both transports use a 4-byte little-endian length prefix in front of every
message:

```
┌───────────────────────┬────────────────────────┐
│ Length (uint32 le)    │ Payload (Length bytes) │
└───────────────────────┴────────────────────────┘
```

Framing is handled inside `IpcServer::receive` / `IpcClient::recv`; callers
deal in whole messages. The codegen's `Command` / `Response` NamedUnion
sits inside that payload — see `ipc-codegen/SCHEMA_SPEC.md`.

## Performance characteristics

| Transport     | Round-trip latency  | Throughput, 1 client | Notes                                |
|---------------|---------------------|----------------------|--------------------------------------|
| UDS           | 6–15 µs             | ~150K msgs/s         | One syscall per `send`/`recv`         |
| MPSC-SHM (hot)| 0.3–1 µs            | ~1M msgs/s           | Lock-free; adaptive spin + futex     |
| MPSC-SHM (cold)| 3–6 µs             | n/a                  | First message after idle ring         |

The `cpp/ipc_runtime/grind_ipc.sh` script and `ipc_runtime_tests` stress the
SHM implementation; benchmark harnesses can reuse the same runtime APIs.

## Threading model

- **UDS server**: single-threaded event loop with `epoll`. Concurrent
  clients are interleaved; handlers run on the loop thread, so heavy work
  should be offloaded.
- **MPSC-SHM server**: single consumer pulling from the per-client request
  ring. Clients write lock-free in parallel; the server is the sole
  reader.
- **UDS client**: each `IpcClient` is single-threaded — share between
  threads via your own synchronisation.
- **MPSC-SHM client**: lock-free producer. Multiple clients can hammer the
  request ring concurrently.

## Limitations

- **SHM** is Linux-first (futex), and capacity is fixed at server-create
  time. Clean shutdown unlinks the request and response shared-memory
  objects automatically when `IpcServer` destructs.
- **UDS** has the usual `ulimit` for file descriptors and one syscall per
  send/recv. Buffer copies on send are unavoidable.

For deep dives:

- `cpp/ipc_runtime/shm/README.md` — lock-free ring-buffer architecture.
- `ipc-codegen/SCHEMA_SPEC.md` — wire-format details consumed by callers.
