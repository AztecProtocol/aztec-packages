#pragma once

#if defined(__linux__) || defined(__wasm__)
#include <arpa/inet.h>
#include <endian.h>
#define ntohll be64toh
#define htonll htobe64
#elif defined(_WIN32)
#include <winsock2.h>
#include <ws2tcpip.h>
// winsock2.h provides ntohll and htonll on newer Windows versions
// Add missing little endian conversion functions for Windows
#include <intrin.h>
#if defined(_M_X64) || defined(_M_IX86)
// Windows x86/x64 is always little endian
#define htole64(x) (x)
#define le64toh(x) (x)
#define htole32(x) (x)
#define le32toh(x) (x)
#define htole16(x) (x)
#define le16toh(x) (x)
#else
// For other Windows architectures, use byte swap functions
#define htole64(x) _byteswap_uint64(x)
#define le64toh(x) _byteswap_uint64(x)
#define htole32(x) _byteswap_ulong(x)
#define le32toh(x) _byteswap_ulong(x)
#define htole16(x) _byteswap_ushort(x)
#define le16toh(x) _byteswap_ushort(x)
#endif
#endif

inline bool is_little_endian()
{
    constexpr int num = 42;
    // NOLINTNEXTLINE Nope. nope nope nope nope nope.
    return (*(char*)&num == 42);
}