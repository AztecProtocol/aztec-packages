# Unix Domain Socket IPC

Simple Unix domain socket server/client for multi-client IPC.

## Features

- Multiple clients can connect to a single server
- Server uses `epoll` for efficient multi-client handling
- Automatic message framing (4-byte length prefix + payload)
- Bidirectional communication
- Simple blocking API for clients
- Non-blocking accept and data polling for server

## Architecture

```
Server Process
├── Listens on Unix domain socket path
├── Uses epoll to handle multiple clients
└── Processes requests from any client

Client 1 ─┐
Client 2 ─┼──> Server
Client 3 ─┘
```

## Example Usage

### Server

```c
#include "socket/uds_server.h"
#include <stdio.h>

int main(void) {
    // Create server with max 10 clients
    struct uds_server* server = uds_server_create("/tmp/my_socket", 10);
    if (!server) {
        perror("uds_server_create");
        return 1;
    }

    // Accept clients
    for (int i = 0; i < 3; i++) {
        int client_id = uds_server_accept(server, -1); // Blocking
        printf("Client %d connected\n", client_id);
    }

    // Process requests
    while (1) {
        int client_id = uds_server_wait_for_data(server, -1); // Blocking
        if (client_id < 0) continue;

        char buf[256];
        ssize_t n = uds_server_recv(server, client_id, buf, sizeof(buf));
        if (n > 0) {
            printf("Received %zd bytes from client %d: %s\n", n, client_id, buf);

            // Echo back
            uds_server_send(server, client_id, buf, n);
        }
    }

    uds_server_close(server);
    return 0;
}
```

### Client

```c
#include "socket/uds_client.h"
#include <string.h>
#include <stdio.h>

int main(void) {
    // Connect to server
    struct uds_client* client = uds_client_connect("/tmp/my_socket");
    if (!client) {
        perror("uds_client_connect");
        return 1;
    }

    // Send message
    const char* msg = "hello server";
    if (uds_client_send(client, msg, strlen(msg) + 1) < 0) {
        perror("uds_client_send");
        return 1;
    }

    // Receive response
    char buf[256];
    ssize_t n = uds_client_recv(client, buf, sizeof(buf));
    if (n > 0) {
        printf("Received: %s\n", buf);
    }

    uds_client_close(client);
    return 0;
}
```

## API Reference

### Server API

| Function | Description |
|----------|-------------|
| `uds_server_create(path, max_clients)` | Create server and bind to path |
| `uds_server_accept(server, timeout_ms)` | Accept new client (-1 = blocking) |
| `uds_server_wait_for_data(server, timeout_ms)` | Wait for data from any client |
| `uds_server_recv(server, client_id, buf, len)` | Receive message from client |
| `uds_server_send(server, client_id, buf, len)` | Send message to client |
| `uds_server_disconnect(server, client_id)` | Disconnect specific client |
| `uds_server_close(server)` | Close server and all connections |

### Client API

| Function | Description |
|----------|-------------|
| `uds_client_connect(path)` | Connect to server |
| `uds_client_send(client, buf, len)` | Send message to server |
| `uds_client_recv(client, buf, len)` | Receive message from server |
| `uds_client_close(client)` | Close connection |

## Performance

Performance characteristics from benchmark (3 clients @ max rate):

- **SPSC (shared memory)**: ~14 µs roundtrip
- **MPSC (shared memory)**: ~40 µs roundtrip
- **Unix sockets**: ~56 µs roundtrip

Unix sockets are slower than shared memory due to syscall overhead (send/recv), but offer:
- Simpler API
- Better portability
- Natural multi-client support
- Access control via filesystem permissions

## Message Framing

All messages are automatically framed with a 4-byte length prefix:

```
[4 bytes: message length][N bytes: message data]
```

This ensures complete messages are sent/received atomically, even if the underlying socket delivers data in chunks.

## Notes

- Server uses epoll (Linux-specific) for efficient multi-client handling
- Maximum 32 simultaneous clients (configurable via UDS_MAX_CLIENTS)
- Socket path is limited to 108 characters (Unix domain socket limit)
- Server automatically unlinks socket file on close
- Messages larger than receive buffer will fail with EMSGSIZE

## See Also

- `shm/` - Shared memory IPC (SPSC and MPSC) for ultra-low latency
- `benchmark/poseidon2_bench/poseidon2.bench.cpp` - Full usage example with multi-client contention
