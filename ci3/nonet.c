// nonet.c – block external network, allow:
//   - Unix domain sockets (AF_UNIX)
//   - IPv4/IPv6 loopback (127.0.0.0/8, ::1)
//   - getaddrinfo for localhost / numeric hosts

#define _GNU_SOURCE
#include <dlfcn.h>
#include <sys/types.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <netdb.h>
#include <errno.h>
#include <string.h>

typedef int (*connect_f)(int, const struct sockaddr *, socklen_t);
typedef int (*getaddrinfo_f)(const char *, const char *,
                             const struct addrinfo *, struct addrinfo **);

static connect_f real_connect = NULL;
static getaddrinfo_f real_getaddrinfo = NULL;

static void init_real_connect(void) {
    if (!real_connect) {
        real_connect = (connect_f)dlsym(RTLD_NEXT, "connect");
    }
}

static void init_real_getaddrinfo(void) {
    if (!real_getaddrinfo) {
        real_getaddrinfo = (getaddrinfo_f)dlsym(RTLD_NEXT, "getaddrinfo");
    }
}

static int is_numeric_host(const char *node) {
    struct in_addr a4;
    struct in6_addr a6;
    if (!node) return 0;
    if (inet_pton(AF_INET, node, &a4) == 1) return 1;
    if (inet_pton(AF_INET6, node, &a6) == 1) return 1;
    return 0;
}

/* Allow UDS and loopback; block all other connects */
int connect(int sockfd, const struct sockaddr *addr, socklen_t addrlen) {
    init_real_connect();

    if (!addr) {
        errno = ENETUNREACH;
        return -1;
    }

    sa_family_t fam = addr->sa_family;

    if (fam == AF_UNIX) {
        // Always allow Unix domain sockets
        return real_connect(sockfd, addr, addrlen);
    }

    if (fam == AF_INET) {
        const struct sockaddr_in *sin = (const struct sockaddr_in *)addr;
        uint32_t a = ntohl(sin->sin_addr.s_addr);

        // 127.0.0.0/8 is loopback
        if ((a & 0xff000000u) == 0x7f000000u) {
            return real_connect(sockfd, addr, addrlen);
        }

        errno = ENETUNREACH;
        return -1;
    }

    if (fam == AF_INET6) {
        const struct sockaddr_in6 *sin6 = (const struct sockaddr_in6 *)addr;
        if (IN6_IS_ADDR_LOOPBACK(&sin6->sin6_addr)) {
            return real_connect(sockfd, addr, addrlen);
        }

        errno = ENETUNREACH;
        return -1;
    }

    // Any other family: block
    errno = ENETUNREACH;
    return -1;
}

/* Allow localhost / numeric hosts; block other DNS lookups */
int getaddrinfo(const char *node, const char *service,
                const struct addrinfo *hints, struct addrinfo **res) {
    init_real_getaddrinfo();

    // Allow:
    //  - node == NULL (e.g. passive/bind)
    //  - "localhost"
    //  - numeric addresses (127.0.0.1, ::1, etc.)
    if (!node ||
        strcmp(node, "localhost") == 0 ||
        is_numeric_host(node)) {
        return real_getaddrinfo(node, service, hints, res);
    }

    // Block any other hostname
    (void)service;
    (void)hints;
    (void)res;
    return EAI_FAIL;
}
