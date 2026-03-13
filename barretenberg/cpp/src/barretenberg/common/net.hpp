#pragma once

#if defined(_WIN32)
#include <winsock2.h>
#define ntohll(x) __builtin_bswap64(x)
#define htonll(x) __builtin_bswap64(x)
#elif defined(__linux__) || defined(__wasm__)
#include <arpa/inet.h>
#include <endian.h>
#define ntohll be64toh
#define htonll htobe64
#endif

inline bool is_little_endian()
{
    constexpr int num = 42;
    // NOLINTNEXTLINE Nope. nope nope nope nope nope.
    return (*(char*)&num == 42);
}