// nonet.c – block network sockets, allow Unix domain sockets

#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netdb.h>
#include <errno.h>

typedef int (*connect_f)(int, const struct sockaddr *, socklen_t);

static connect_f real_connect = NULL;

static void init_real_connect(void) {
    if (!real_connect) {
        real_connect = (connect_f)dlsym(RTLD_NEXT, "connect");
    }
}

/* Block non-UDS connect(), allow AF_UNIX */
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    init_real_connect();

    if (addr && addr->sa_family == AF_UNIX) {
        // Allow Unix domain sockets
        return real_connect(sockfd, addr, addrlen);
    }

    // Block everything else (INET/INET6/...)
    errno = ENETUNREACH;
    return -1;
}

/* Optional: nuke DNS resolution completely */
int getaddrinfo(const char *node, const char *service,
                const struct addrinfo *hints, struct addrinfo **res) {
    (void)node; (void)service; (void)hints; (void)res;
    return EAI_FAIL;
}
