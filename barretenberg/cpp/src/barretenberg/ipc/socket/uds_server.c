/* uds_server.c — Unix Domain Socket Server Implementation */
#include "uds_server.h"
#include <errno.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

struct uds_server {
    int listen_fd;
    int epoll_fd;
    int max_clients;
    int num_clients;
    int* client_fds;      // Array of client sockets
    char path[108];
};

struct uds_server* uds_server_create(const char* path, int max_clients)
{
    if (!path || max_clients <= 0 || max_clients > UDS_MAX_CLIENTS) {
        errno = EINVAL;
        return NULL;
    }

    struct uds_server* s = (struct uds_server*)calloc(1, sizeof(struct uds_server));
    if (!s)
        return NULL;

    s->max_clients = max_clients;
    s->client_fds = (int*)calloc((size_t)max_clients, sizeof(int));
    if (!s->client_fds) {
        free(s);
        return NULL;
    }

    // Initialize client fds to -1 (unused)
    for (int i = 0; i < max_clients; i++) {
        s->client_fds[i] = -1;
    }

    strncpy(s->path, path, sizeof(s->path) - 1);

    // Remove any existing socket file
    unlink(path);

    // Create socket
    s->listen_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (s->listen_fd < 0) {
        free(s->client_fds);
        free(s);
        return NULL;
    }

    // Bind to path
    struct sockaddr_un addr;
    memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);

    if (bind(s->listen_fd, (struct sockaddr*)&addr, sizeof(addr)) < 0) {
        close(s->listen_fd);
        free(s->client_fds);
        free(s);
        return NULL;
    }

    // Listen
    if (listen(s->listen_fd, max_clients) < 0) {
        close(s->listen_fd);
        unlink(path);
        free(s->client_fds);
        free(s);
        return NULL;
    }

    // Create epoll instance
    s->epoll_fd = epoll_create1(0);
    if (s->epoll_fd < 0) {
        close(s->listen_fd);
        unlink(path);
        free(s->client_fds);
        free(s);
        return NULL;
    }

    // Add listen socket to epoll
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = s->listen_fd;
    if (epoll_ctl(s->epoll_fd, EPOLL_CTL_ADD, s->listen_fd, &ev) < 0) {
        close(s->epoll_fd);
        close(s->listen_fd);
        unlink(path);
        free(s->client_fds);
        free(s);
        return NULL;
    }

    return s;
}

int uds_server_accept(struct uds_server* s, int timeout_ms)
{
    if (!s || s->num_clients >= s->max_clients) {
        errno = EINVAL;
        return -1;
    }

    // Wait for connection
    struct epoll_event ev;
    int n = epoll_wait(s->epoll_fd, &ev, 1, timeout_ms);
    if (n <= 0)
        return -1;

    if (ev.data.fd != s->listen_fd) {
        errno = EINVAL;
        return -1;
    }

    // Accept connection
    int client_fd = accept(s->listen_fd, NULL, NULL);
    if (client_fd < 0)
        return -1;

    // Find free slot
    int client_id = -1;
    for (int i = 0; i < s->max_clients; i++) {
        if (s->client_fds[i] == -1) {
            client_id = i;
            break;
        }
    }

    if (client_id < 0) {
        close(client_fd);
        errno = ENOMEM;
        return -1;
    }

    s->client_fds[client_id] = client_fd;
    s->num_clients++;

    // Add client to epoll
    ev.events = EPOLLIN;
    ev.data.fd = client_fd;
    if (epoll_ctl(s->epoll_fd, EPOLL_CTL_ADD, client_fd, &ev) < 0) {
        close(client_fd);
        s->client_fds[client_id] = -1;
        s->num_clients--;
        return -1;
    }

    return client_id;
}

int uds_server_wait_for_data(struct uds_server* s, int timeout_ms)
{
    if (!s) {
        errno = EINVAL;
        return -1;
    }

    struct epoll_event ev;
    int n = epoll_wait(s->epoll_fd, &ev, 1, timeout_ms);
    if (n <= 0)
        return -1;

    // Check if it's listen socket (new connection) or client data
    if (ev.data.fd == s->listen_fd) {
        errno = EAGAIN; // Signal caller to call accept
        return -1;
    }

    // Find which client
    for (int i = 0; i < s->max_clients; i++) {
        if (s->client_fds[i] == ev.data.fd) {
            return i;
        }
    }

    errno = ENOENT;
    return -1;
}

ssize_t uds_server_recv(struct uds_server* s, int client_id, void* buf, size_t buflen)
{
    if (!s || client_id < 0 || client_id >= s->max_clients || s->client_fds[client_id] < 0) {
        errno = EINVAL;
        return -1;
    }

    int fd = s->client_fds[client_id];

    // Read length prefix (4 bytes)
    uint32_t msg_len;
    ssize_t n = recv(fd, &msg_len, sizeof(msg_len), MSG_WAITALL);
    if (n != sizeof(msg_len)) {
        if (n == 0) {
            // Client disconnected
            uds_server_disconnect(s, client_id);
        }
        return -1;
    }

    if (msg_len > buflen) {
        errno = EMSGSIZE;
        return -1;
    }

    // Read message
    n = recv(fd, buf, msg_len, MSG_WAITALL);
    if (n != (ssize_t)msg_len) {
        if (n == 0 || n < 0) {
            uds_server_disconnect(s, client_id);
        }
        return -1;
    }

    return n;
}

ssize_t uds_server_send(struct uds_server* s, int client_id, const void* buf, size_t len)
{
    if (!s || client_id < 0 || client_id >= s->max_clients || s->client_fds[client_id] < 0) {
        errno = EINVAL;
        return -1;
    }

    int fd = s->client_fds[client_id];

    // Send length prefix
    uint32_t msg_len = (uint32_t)len;
    ssize_t n = send(fd, &msg_len, sizeof(msg_len), 0);
    if (n != sizeof(msg_len))
        return -1;

    // Send message
    n = send(fd, buf, len, 0);
    if (n != (ssize_t)len)
        return -1;

    return n;
}

void uds_server_disconnect(struct uds_server* s, int client_id)
{
    if (!s || client_id < 0 || client_id >= s->max_clients)
        return;

    int fd = s->client_fds[client_id];
    if (fd >= 0) {
        epoll_ctl(s->epoll_fd, EPOLL_CTL_DEL, fd, NULL);
        close(fd);
        s->client_fds[client_id] = -1;
        s->num_clients--;
    }
}

void uds_server_close(struct uds_server* s)
{
    if (!s)
        return;

    // Close all clients
    for (int i = 0; i < s->max_clients; i++) {
        if (s->client_fds[i] >= 0) {
            close(s->client_fds[i]);
        }
    }

    if (s->epoll_fd >= 0)
        close(s->epoll_fd);
    if (s->listen_fd >= 0)
        close(s->listen_fd);

    unlink(s->path);
    free(s->client_fds);
    free(s);
}
