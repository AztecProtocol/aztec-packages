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
cd rust && cargo build

# TypeScript package (publishes @aztec-foundation/ipc-runtime via file: link)
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
      constants.hpp               # shared limits/defaults (mirrored in ts/src/types.ts)
      ipc_client.{hpp,cpp}        # abstract IpcClient interface + factories
      ipc_server.{hpp,cpp}        # abstract IpcServer interface + factories + run() loop
      socket_client.{hpp,cpp}     # UDS client implementation
      socket_server.{hpp,cpp}     # UDS server implementation (epoll / kqueue)
      shm_client.hpp              # single-client (SPSC) SHM client
      shm_server.hpp              # single-client (SPSC) SHM server
      mpsc_shm_client.hpp         # multi-client SHM client (one slot per client)
      mpsc_shm_server.hpp         # multi-client SHM server
      shm_common.hpp              # length + request-id framing over the rings
      shm/                        # lock-free SPSC/MPSC ring buffer primitives
      serve_helper.{hpp,cpp}      # ipc::make_server / make_client (path-suffix dispatch)
      signal_handlers.{hpp,cpp}   # ipc::install_default_signal_handlers
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
                                                    std::size_t client_id = kAutoClientId);

  virtual bool                       connect()                                                = 0;
  // Explicit-id primitives — for pipelining callers that own their own pairing.
  virtual bool                       send(uint64_t request_id, const void* data, size_t len,
                                          uint64_t timeout_ns)                               = 0;
  virtual std::span<const uint8_t>   receive(uint64_t timeout_ns, uint64_t& request_id)      = 0;
  // Serial convenience — auto-assigns ids and verifies the echo (one in flight).
  bool                               send(const void* data, size_t len, uint64_t timeout_ns);
  std::span<const uint8_t>           receive(uint64_t timeout_ns);
  virtual void                       release(size_t message_size)                            = 0;
  virtual void                       close()                                                 = 0;
};

class IpcServer {
public:
  using Handler = std::function<std::vector<uint8_t>(int client_id, std::span<const uint8_t>)>;

  static std::unique_ptr<IpcServer> create_socket(const std::string& path, int max_clients);
  static std::unique_ptr<IpcServer> create_shm(const std::string& base_name,
                                               std::size_t request_ring_size  = DEFAULT_RING_SIZE,
                                               std::size_t response_ring_size = DEFAULT_RING_SIZE);
  static std::unique_ptr<IpcServer> create_mpsc_shm(const std::string& base_name,
                                                    std::size_t max_clients,
                                                    std::size_t request_ring_size  = DEFAULT_RING_SIZE,
                                                    std::size_t response_ring_size = DEFAULT_RING_SIZE);

  virtual bool listen()                                                          = 0;
  virtual int  wait_for_data(uint64_t timeout_ns)                                = 0;
  virtual std::span<const uint8_t> receive(int client_id, uint64_t& request_id)  = 0;
  virtual void release(int client_id, size_t message_size)                       = 0;
  virtual bool send(int client_id, uint64_t request_id, const void* data, size_t len) = 0;
  virtual void close()                                                           = 0;
  virtual void request_shutdown();                  // NOT signal-safe (wakes waiters)
  void request_shutdown_from_signal() noexcept;     // signal-safe variant
  virtual void run(const Handler& handler);         // serial event loop (echoes ids)
  void run_reactor(const AsyncHandler& handler);    // async loop: handlers respond from any
                                                    // thread; responses sent in completion order
};

std::unique_ptr<IpcServer> make_server(const std::string& path, const ServerOptions& = {});
std::unique_ptr<IpcClient> make_client(const std::string& path,
                                       std::size_t shm_client_id = kAutoClientId);

void install_default_signal_handlers(IpcServer& server);

} // namespace ipc
```

`receive` returns a zero-copy span (into the SHM ring or the socket's
internal buffer); the caller must follow it with `release(span.size())`
before the next `receive` on the same client. The `run()` event loop owns
that pattern so handlers just deal in whole messages.

Every request gets exactly one response: a handler returning a
zero-length vector sends a zero-length response frame (which clients see as
a valid empty reply, in every language binding). To exit the loop cleanly,
call `request_shutdown()`; `install_default_signal_handlers` wires
SIGINT/SIGTERM to the signal-safe `request_shutdown_from_signal()` so RAII
destructors run normally.

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

### TypeScript (`ts/`, published as `@aztec-foundation/ipc-runtime`)

Two transport-specific clients:

| Class                | Transport                  | Sync / Async                                                 |
|----------------------|----------------------------|--------------------------------------------------------------|
| `UdsIpcClient`       | Node `net.Socket`          | async; pipelines, pairs responses to callers by request id   |
| `NapiShmSyncClient`  | MPSC-SHM via NAPI bridge   | sync (one in flight)                                         |
| `NapiShmAsyncClient` | MPSC-SHM via NAPI bridge   | async (C++ poll thread + ThreadSafeFunction bridge); pipelines, pairs by request id |

`UdsIpcServer` is provided for in-process tests; production servers are in
C++.

### Zig (`zig/`)

`Server.fromPath(path)` / `Client.fromPath(path)` over the same C ABI; the
Zig `build.zig` compiles the C++ sources directly with the bundled clang +
libc++, so there's no archive shim.

## Shared constants

`cpp/ipc_runtime/constants.hpp` (mirrored in `ts/src/types.ts`) is the single
definition of the transport limits and defaults:

| Constant | Value | Meaning |
|----------|-------|---------|
| `MAX_FRAME_SIZE` | 256 MiB | Max length prefix accepted on receive; larger frames close the connection / fail the ring instead of allocating. |
| `CONNECT_RETRY_BUDGET_MS` | 5000 | Total client connect retry budget (all transports). |
| `DEFAULT_RING_SIZE` | 4 MiB | SHM ring size per direction per client. |
| `SOCKET_BACKLOG` | 10 | Default UDS listen backlog. |
| `DEFAULT_CALL_TIMEOUT_NS` | 0 | Per-call timeout for client send/receive; 0 = infinite. (`IpcServer::wait_for_data(0)` is the documented exception: non-blocking poll.) |

## Wire framing

Both transports frame every message as a length prefix, a request id, and
the payload; the length counts the id plus the payload:

```
┌────────────────────┬─────────────────────────┬──────────────────────────────┐
│ Length (uint32 le) │ Request id (uint64 le)  │ Payload (Length − 8 bytes)   │
└────────────────────┴─────────────────────────┴──────────────────────────────┘
```

The id is client-assigned (per-connection random-start counter; 0 is
reserved for server-initiated frames) and echoed verbatim on the response.
Clients correlate responses by id, so the server sends responses in
**completion order** — there is no FIFO contract on the wire, and a slow
request never delays a fast one's response. A frame whose id matches
nothing outstanding is a stale leftover on SHM (rings persist across slot
occupants — it is released and skipped) and a fatal desync on UDS (the
kernel guarantees a fresh stream, so the connection is failed loudly).

Framing is handled inside `IpcServer::receive` / `IpcClient::receive`;
callers deal in whole payloads and never see ids unless they use the
explicit-id primitives. The codegen's `Command` / `Response` NamedUnion
sits inside the payload — see `ipc-codegen/SCHEMA_SPEC.md`.

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

- **POSIX-only**: Linux and macOS are the supported platforms (futex on
  Linux, `os_sync_wait_on_address` on macOS; epoll/kqueue for sockets).
  Other platforms fail the build with an explicit `#error`.
- **SHM** capacity is fixed at server-create time. Clean shutdown unlinks
  the request and response shared-memory objects automatically when
  `IpcServer` destructs; fatal signals best-effort unlink them when
  `install_default_signal_handlers` is in place.
- **UDS** has the usual `ulimit` for file descriptors and one syscall per
  send/recv. Buffer copies on send are unavoidable.

For deep dives:

- `cpp/ipc_runtime/shm/README.md` — lock-free ring-buffer architecture.
- `ipc-codegen/SCHEMA_SPEC.md` — wire-format details consumed by callers.
