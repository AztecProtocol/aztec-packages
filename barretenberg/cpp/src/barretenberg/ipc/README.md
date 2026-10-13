# Barretenberg IPC Module

This module is the bb-local IPC library, namespace `bb::ipc`. It is a fork of
the standalone [ipc-runtime](../../../../../ipc-runtime/README.md) library,
which the `avm`, `cdb` and `wsdb` services use. The two code trees have
diverged; this README describes the `bb::ipc` code only.

Users of `bb::ipc`:

- The `bb msgpack` server (`api/api_msgpack.cpp`): a path ending in `.shm` selects the SHM transport, `.sock` selects the socket transport.
- The Node.js module's msgpack client (`nodejs_module/msgpack_client/`).
- The IPC benchmark (`benchmark/ipc_bench/`).

## Transports

| Transport | Server factory | Client factory | Clients |
|-----------|----------------|----------------|---------|
| Unix domain socket (`SocketServer` / `SocketClient`) | `IpcServer::create_socket(socket_path, max_clients)` | `IpcClient::create_socket(socket_path)` | Many; the client table grows on demand |
| SHM, SPSC (`ShmServer` / `ShmClient`) | `IpcServer::create_shm(base_name, request_ring_size = 1MB, response_ring_size = 1MB)` | `IpcClient::create_shm(base_name)` | One (1:1) |
| SHM, MPSC (`MpscShmServer` / `MpscShmClient`) | `IpcServer::create_mpsc_shm(base_name, max_clients, request_ring_size = 1MB, response_ring_size = 1MB)` | `IpcClient::create_mpsc_shm(base_name, client_id)` | Up to `max_clients`; each client passes its own `client_id` |

Sockets work on one machine only (no TCP). Use them when the client count is
dynamic. Use SHM when latency matters and the client count is fixed.

## Server

```cpp
class IpcServer {
public:
    using Handler = std::function<std::vector<uint8_t>(int client_id, std::span<const uint8_t> request)>;

    virtual bool listen() = 0;
    virtual int wait_for_data(uint64_t timeout_ns) = 0;   // returns a client_id, or < 0
    virtual std::span<const uint8_t> receive(int client_id) = 0;
    virtual void release(int client_id, size_t message_size) = 0;
    virtual bool send(int client_id, const void* data, size_t len) = 0;
    virtual void close() = 0;
    virtual void request_shutdown();   // sets the shutdown flag and wakes waiters
    virtual int accept();              // socket servers accept new clients; default no-op
    virtual void run(const Handler& handler);
    // factories: see the table above
};
```

`run()` loops until shutdown is requested. Each iteration calls `accept()`,
waits up to 100 ms with `wait_for_data`, receives one request, calls the
handler, sends the response if it is non-empty, and releases the request.

To stop the loop from a handler, throw `ShutdownRequested(response)`. `run()`
releases the request, sends `response` if it is non-empty, and returns, so
destructors run normally:

```cpp
#include "barretenberg/ipc/ipc_server.hpp"

auto server = bb::ipc::IpcServer::create_socket("/tmp/my.sock", 10);
server->listen();
server->run([](int client_id, std::span<const uint8_t> request) {
    if (is_shutdown_request(request)) {
        throw bb::ipc::ShutdownRequested(encode_goodbye());
    }
    return process(request);
});
```

## Client

```cpp
class IpcClient {
public:
    virtual bool connect() = 0;
    virtual bool send(const void* data, size_t len, uint64_t timeout_ns) = 0;   // 0 = infinite
    virtual std::span<const uint8_t> receive(uint64_t timeout_ns) = 0;          // empty on error/timeout
    virtual void release(size_t message_size) = 0;
    virtual void close() = 0;
    // factories: see the table above
};
```

`receive()` returns a span that stays valid until `release()` or the next
`receive()`. For SHM it points into the ring buffer (zero-copy); for sockets it
points into an internal buffer. Always follow it with `release(span.size())`:

```cpp
#include "barretenberg/ipc/ipc_client.hpp"

auto client = bb::ipc::IpcClient::create_socket("/tmp/my.sock");
if (!client->connect()) { /* handle failure */ }

std::vector<uint8_t> request = encode_request();
if (!client->send(request.data(), request.size(), /*timeout_ns=*/0)) { /* handle failure */ }

auto response = client->receive(/*timeout_ns=*/0);
if (response.empty()) { /* handle failure or timeout */ }
handle(response);
client->release(response.size());
```

## Message framing

Both transports prefix each message with a 4-byte little-endian length:

```
┌────────────┬──────────────────┐
│ Length     │ Payload          │
│ (4 bytes)  │ (Length bytes)   │
└────────────┴──────────────────┘
```

The implementations add and strip it; callers see whole payloads, never partial ones.

## Implementation notes

- **SocketServer**: epoll on Linux, kqueue on macOS. The client table grows on
  demand, with an `fd -> client_id` `std::unordered_map` for lookup. Clients are
  cleaned up on disconnect.
- **SocketClient**: owns its socket fd and closes it on destruction.
- **ShmServer**: one SPSC request ring and one SPSC response ring.
- **MpscShmServer**: an MPSC consumer for requests (one SPSC ring per client)
  and a separate SPSC response ring per client. The consumer polls the client
  rings round-robin and sleeps on a shared doorbell futex.
- SHM servers unlink their shared-memory objects on `close()` and on
  destruction.

The ring buffers are described in [`shm/README.md`](shm/README.md).

## Threading model

- **Socket server:** Single-threaded event loop
- **Socket client:** Thread-safe (each client is independent)
- **Shared memory server:** Single-threaded consumer (by design)
- **Shared memory client:** Lock-free producer (multiple clients can send concurrently)

## Limitations

- Linux (futex) and macOS (`os_sync_wait_on_address`) only.
- Sockets: one syscall per message, a buffer copy on send, and the usual file
  descriptor limits (`ulimit`).
- SHM: client capacity and ring sizes are fixed at server creation. Any process
  that can open the shared-memory objects can read and write them.

## Build and test

The module builds as `barretenberg_module(ipc common)` (`CMakeLists.txt`). From
`barretenberg/cpp`:

```bash
cmake --preset default
cmake --build build --target ipc_tests ipc_bench
./build/bin/ipc_tests
./build/bin/ipc_bench
```

`ipc_bench` compares socket and SHM performance with one and several clients.
`grind_ipc.sh [jobs]` runs `ShmTest.SingleClientSmallRingHighVolume` from
`build/bin/ipc_tests` in a loop until a run fails or you press Ctrl-C (default
128 parallel jobs).

## See Also

- [`shm/README.md`](shm/README.md) - the lock-free ring buffers
- [`shm.test.cpp`](shm.test.cpp) - tests
- [ipc-runtime](../../../../../ipc-runtime/README.md) - the maintained standalone library
