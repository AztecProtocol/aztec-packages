#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <errno.h>

/* Block connect() */
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    errno = ENETUNREACH;     // “Network is unreachable”
    return -1;
}

/* Block getaddrinfo() (DNS resolution) */
int getaddrinfo(const char *node, const char *service,
                const struct addrinfo *hints, struct addrinfo **res) {
    return EAI_FAIL;
}

