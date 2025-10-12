/* uds_client.h — Unix Domain Socket Client for IPC */
#pragma once

#include <stddef.h>
#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif

struct uds_client;

/* Connect to Unix domain socket server
   Returns NULL on error */
struct uds_client* uds_client_connect(const char* path);

/* Send data to server
   Automatically adds length prefix
   Returns bytes sent (>= 0), or -1 on error */
ssize_t uds_client_send(struct uds_client* c, const void* buf, size_t len);

/* Receive data from server
   Reads one complete message (length-prefixed)
   Returns bytes received (>= 0), or -1 on error/disconnect */
ssize_t uds_client_recv(struct uds_client* c, void* buf, size_t buflen);

/* Close connection */
void uds_client_close(struct uds_client* c);

#ifdef __cplusplus
}
#endif
