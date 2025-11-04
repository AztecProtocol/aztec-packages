# Barretenberg IPC Module

Modern C++ inter-process communication (IPC) library providing unified abstractions over multiple transport mechanisms. Designed for high-performance request/response patterns between processes.

## Overview

The IPC module provides:
- **Abstract interfaces** (`IpcClient`, `IpcServer`) for transport-independent code
- **Unix domain sockets** transport for simplicity and broad compatibility
- **Shared memory** transport for ultra-low latency (sub-microsecond)
- **Factory pattern** for easy instantiation
- **Multi-client support** with dynamic capacity (sockets) or fixed capacity (shared memory)
- **Built-in server loop** with graceful shutdown support

## Architecture

```
┌─────────────────────────────────────────────────┐
│           Abstract Interfaces                    │
│    IpcClient            IpcServer                │
│    - connect()          - listen()               │
│    - send()             - wait_for_data()        │
│    - recv()             - recv() / send()        │
│    - close()            - close()                │
│                         - run(handler)           │
└──────────────┬─────────────────┬────────────────┘
               │                 │
       ┌───────┴────────┐ ┌──────┴──────────┐
       │ Socket         │ │ Shared Memory   │
       │ Implementation │ │ Implementation  │
       └────────────────┘ └─────────────────┘
```

### Transport Implementations

#### 1. Unix Domain Sockets (`SocketClient` / `SocketServer`)

**Architecture:**
- Standard POSIX socket API with epoll for multi-client handling
- Direct implementation (no wrapper layers)
- Dynamic client capacity with O(1) client lookup
- Requires system calls for each message

**Use when:**
- Simplicity and compatibility are priorities
- Latency requirements are moderate (5-15 µs)
- Need unlimited dynamic client capacity
- Running in environments without shared memory support

**Example:**
```cpp
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/ipc_client.hpp"

// Server process
auto server = IpcServer::create_socket("/tmp/my.sock", 10);  // max 10 initial clients
server->listen();

server->run([](int client_id, std::span<const uint8_t> request) {
    // Process request, return response
    std::vector<uint8_t> response = process(request);
    return response;
});

// Client process
auto client = IpcClient::create_socket("/tmp/my.sock");
client->connect();

std::vector<uint8_t> request = {...};
client->send(request.data(), request.size());

std::vector<uint8_t> response(1024);
ssize_t n = client->recv(response.data(), response.size());
```

#### 2. Shared Memory (`ShmClient` / `ShmServer`)

**Architecture:**
- Lock-free SPSC/MPSC ring buffers (see `shm/README.md` for details)
- Requests: MPSC (multi-producer single-consumer) ring
- Responses: Dedicated SPSC ring per client
- Adaptive spin + futex for efficient blocking
- Fixed client capacity (set at server creation)

**Use when:**
- Ultra-low latency is critical (0.3-1 µs hot, 3-6 µs cold)
- Number of clients is known and fixed
- Linux/POSIX shared memory available
- Zero-copy message passing desired

**Example:**
```cpp
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/ipc_client.hpp"

// Server process
auto server = IpcServer::create_shm("my_shm", 4);  // exactly 4 clients
server->listen();

server->run([](int client_id, std::span<const uint8_t> request) {
    std::vector<uint8_t> response = process(request);
    return response;
});

// Client process (run 4 instances)
auto client = IpcClient::create_shm("my_shm", 4);
client->connect();  // Atomically claims client_id 0, 1, 2, or 3

std::vector<uint8_t> request = {...};
client->send(request.data(), request.size());

std::vector<uint8_t> response(1024);
ssize_t n = client->recv(response.data(), response.size());
```

## API Reference

### IpcClient Interface

```cpp
class IpcClient {
public:
    virtual ~IpcClient() = default;

    // Connect to server
    virtual bool connect() = 0;

    // Send request to server
    virtual bool send(const void* data, size_t len, uint64_t timeout_ns = 0) = 0;

    // Receive response from server
    virtual ssize_t recv(void* buffer, size_t max_len, uint64_t timeout_ns = 0) = 0;

    // Close connection
    virtual void close() = 0;

    // Factory methods
    static std::unique_ptr<IpcClient> create_socket(const std::string& socket_path);
    static std::unique_ptr<IpcClient> create_shm(const std::string& base_name, size_t max_clients);
};
```

### IpcServer Interface

```cpp
class IpcServer {
public:
    using Handler = std::function<std::vector<uint8_t>(int client_id, std::span<const uint8_t> request)>;

    virtual ~IpcServer() = default;

    // Start listening for connections
    virtual bool listen() = 0;

    // Wait for data from any client (returns client_id)
    virtual int wait_for_data(uint64_t timeout_ns = 0) = 0;

    // Receive from specific client
    virtual ssize_t recv(int client_id, void* buffer, size_t max_len) = 0;

    // Send to specific client
    virtual bool send(int client_id, const void* data, size_t len) = 0;

    // Close server
    virtual void close() = 0;

    // High-level event loop with handler
    virtual void run(Handler handler, size_t max_message_size = 1024 * 1024);

    // Factory methods
    static std::unique_ptr<IpcServer> create_socket(const std::string& socket_path, int max_clients);
    static std::unique_ptr<IpcServer> create_shm(const std::string& base_name, size_t max_clients);
};
```

### Graceful Shutdown

The server's `run()` method supports graceful shutdown via exception:

```cpp
#include "barretenberg/ipc/ipc_server.hpp"

server->run([](int client_id, std::span<const uint8_t> request) {
    if (is_shutdown_request(request)) {
        std::vector<uint8_t> goodbye = encode_goodbye();
        throw ShutdownRequested(goodbye);  // Sends response, then exits cleanly
    }
    return process_normal_request(request);
});
// Destructors run here, cleaning up all resources
```

## Performance Comparison

### Latency (Round-trip time)

| Transport      | Hot Path       | Cold Path    | Notes                          |
|----------------|----------------|--------------|--------------------------------|
| Sockets        | 6-15 µs        | 10-20 µs     | Requires syscalls per message  |
| Shared Memory  | 0.3-1 µs       | 3-6 µs       | Zero-copy, adaptive spin+futex |

### Throughput

| Transport      | Single Client  | Multi-Client (3) | Notes                    |
|----------------|----------------|------------------|--------------------------|
| Sockets        | ~150K msgs/s   | ~120K msgs/s     | Epoll scales well        |
| Shared Memory  | ~1M msgs/s     | ~700K msgs/s     | Lock-free, per-client queues |

*Benchmarks measured on AMD Ryzen 9 5950X, small messages (<1KB)*

## Implementation Details

### Socket Transport

**SocketClient:**
- Direct socket file descriptor management
- RAII cleanup (close on destruction)
- Blocking I/O with optional timeout
- Length-prefixed messages (4-byte header)

**SocketServer:**
- Epoll for efficient multi-client event handling
- Dynamic client table (grows on demand)
- O(1) fd→client_id lookup via `std::unordered_map`
- Automatic cleanup on client disconnect

### Shared Memory Transport

**ShmClient:**
- Atomically claims client ID from shared counter
- Connects to MPSC ring (producer role) for requests
- Connects to dedicated SPSC ring (consumer role) for responses
- Length-prefixed messages (4-byte header) matching socket behavior

**ShmServer:**
- Creates MPSC consumer for receiving requests from all clients
- Pre-creates SPSC rings for each client's responses
- Round-robin polling across client rings
- Shared doorbell futex for efficient wakeup

For deep dive into shared memory ring buffer architecture, see [`shm/README.md`](shm/README.md).

## Build Integration

The IPC module is included in Barretenberg's main CMake build:

```cmake
# CMakeLists.txt
add_library(ipc
    ipc_client.cpp
    ipc_server.cpp
    socket_client.cpp
    socket_server.cpp
    # shm implementations are header-only
)

target_link_libraries(ipc
    PRIVATE pthread  # For futex operations
    PRIVATE rt       # For shm_open/shm_unlink
)
```

## Testing

Run IPC tests with:

```bash
# From barretenberg/cpp
cd build-no-avm
ninja ipc_bench  # Performance benchmarks
./bin/ipc_bench
```

The benchmark compares socket vs shared memory performance with single and multiple clients.

## Best Practices

### Choosing a Transport

**Use sockets when:**
- You need dynamic client capacity
- Compatibility and simplicity are priorities
- Moderate latency (10-15 µs) is acceptable
- You're crossing network boundaries (with TCP sockets)

**Use shared memory when:**
- Ultra-low latency (<1 µs) is critical
- Number of clients is known and fixed
- Running on same machine with POSIX shared memory
- You want zero-copy message passing

### Error Handling

All operations return bool (success) or -1 (error) for easy checking:

```cpp
if (!client->connect()) {
    // Handle connection failure
}

if (!client->send(data, len)) {
    // Handle send failure
}

ssize_t n = client->recv(buffer, size);
if (n < 0) {
    // Handle receive failure/timeout
}
```

### Resource Management

Both transports use RAII for automatic cleanup:

```cpp
{
    auto server = IpcServer::create_socket("/tmp/my.sock", 10);
    server->listen();
    // Use server...
}  // Destructor closes connections and cleans up resources
```

For shared memory, the server should explicitly unlink on clean shutdown:

```cpp
auto server = IpcServer::create_shm("my_shm", 4);
server->listen();
server->run(handler);
// Destructor automatically calls unlink to remove shared memory objects
```

### Message Framing

Both transports use 4-byte length prefixes for messages:

```
┌────────────┬──────────────────┐
│ Length     │ Payload          │
│ (4 bytes)  │ (Length bytes)   │
└────────────┴──────────────────┘
```

This is handled automatically by the implementations.

### Threading Model

- **Socket server:** Single-threaded event loop with epoll
- **Socket client:** Thread-safe (each client is independent)
- **Shared memory server:** Single-threaded consumer (by design)
- **Shared memory client:** Lock-free producer (multiple clients can send concurrently)

## Limitations

### Sockets
- System call overhead (cannot eliminate)
- Buffer copying on send/recv
- File descriptor limits (ulimit)

### Shared Memory
- Fixed client capacity (must specify at creation)
- Linux-specific (uses futex, though portable to other POSIX systems)
- Requires cleanup of /dev/shm objects (automatic on destruction)
- No security boundaries (all clients can access all memory)

## Future Enhancements

Potential improvements for future versions:

- [ ] Zero-copy socket option (SCM_RIGHTS / vmsplice)
- [ ] Configurable ring buffer sizes for shared memory
- [ ] Metrics/telemetry API (latency histograms, throughput)
- [ ] Windows named pipes support
- [ ] Cross-platform shared memory abstraction (Windows shared memory objects)

## See Also

- [`shm/README.md`](shm/README.md) - Deep dive into lock-free ring buffer implementation
- [`shm.test.cpp`](shm.test.cpp) - Comprehensive test suite
- Benchmarks in `barretenberg/cpp/build-no-avm/bin/ipc_bench`
