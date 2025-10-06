/* uds_server.h — Unix Domain Socket Server for Multi-Client IPC */
#pragma once

#include <stddef.h>
#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

#define UDS_MAX_CLIENTS 32

struct uds_server;

/* Create server and bind to Unix domain socket path
   max_clients: maximum number of simultaneous clients
   Returns NULL on error */
struct uds_server* uds_server_create(const char* path, int max_clients);

/* Accept new client connection
   timeout_ms: -1 for blocking, 0 for non-blocking, >0 for timeout
   Returns client_id (>= 0) on success, -1 on error/timeout */
int uds_server_accept(struct uds_server* s, int timeout_ms);

/* Wait for data from any connected client
   timeout_ms: -1 for blocking, 0 for poll, >0 for timeout
   Returns client_id with data (>= 0), or -1 on error/timeout */
int uds_server_wait_for_data(struct uds_server* s, int timeout_ms);

/* Receive data from specific client
   Reads one complete message (length-prefixed)
   Returns bytes received (>= 0), or -1 on error/disconnect */
ssize_t uds_server_recv(struct uds_server* s, int client_id, void* buf, size_t buflen);

/* Send data to specific client
   Automatically adds length prefix
   Returns bytes sent (>= 0), or -1 on error */
ssize_t uds_server_send(struct uds_server* s, int client_id, const void* buf, size_t len);

/* Close client connection */
void uds_server_disconnect(struct uds_server* s, int client_id);

/* Close server and all connections */
void uds_server_close(struct uds_server* s);

#ifdef __cplusplus
}
#endif
