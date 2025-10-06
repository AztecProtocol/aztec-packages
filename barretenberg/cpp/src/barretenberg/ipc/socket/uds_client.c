/* uds_client.c — Unix Domain Socket Client Implementation */
#include "uds_client.h"
#include <errno.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

struct uds_client {
    int fd;
};

struct uds_client* uds_client_connect(const char* path)
{
    if (!path) {
        errno = EINVAL;
        return NULL;
    }

    struct uds_client* c = (struct uds_client*)malloc(sizeof(struct uds_client));
    if (!c)
        return NULL;

    // Create socket
    c->fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (c->fd < 0) {
        free(c);
        return NULL;
    }

    // Connect to server
    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

    if (connect(c->fd, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(c->fd);
        free(c);
        return NULL;
    }

    return c;
}

ssize_t uds_client_send(struct uds_client* c, const void* buf, size_t len)
{
    if (!c || c->fd < 0) {
        errno = EINVAL;
        return -1;
    }

    // Send length prefix
    uint32_t msg_len = (uint32_t)len;
    ssize_t n = send(c->fd, &msg_len, sizeof(msg_len), 0);
    if (n != sizeof(msg_len))
        return -1;

    // Send message
    n = send(c->fd, buf, len, 0);
    if (n != (ssize_t)len)
        return -1;

    return n;
}

ssize_t uds_client_recv(struct uds_client* c, void* buf, size_t buflen)
{
    if (!c || c->fd < 0) {
        errno = EINVAL;
        return -1;
    }

    // Read length prefix
    uint32_t msg_len;
    ssize_t n = recv(c->fd, &msg_len, sizeof(msg_len), MSG_WAITALL);
    if (n != sizeof(msg_len))
        return -1;

    if (msg_len > buflen) {
        errno = EMSGSIZE;
        return -1;
    }

    // Read message
    n = recv(c->fd, buf, msg_len, MSG_WAITALL);
    if (n != (ssize_t)msg_len)
        return -1;

    return n;
}

void uds_client_close(struct uds_client* c)
{
    if (!c)
        return;

    if (c->fd >= 0)
        close(c->fd);

    free(c);
}
