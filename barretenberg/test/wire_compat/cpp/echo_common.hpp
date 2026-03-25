#pragma once
/**
 * Standalone echo IPC types and helpers for wire compat testing.
 * Uses raw msgpack-c, no barretenberg dependencies.
 */

// The Aztec fork of msgpack-c uses THROW/RETHROW macros instead of throw
#ifndef THROW
#define THROW throw
#endif
#ifndef RETHROW
#define RETHROW throw
#endif

#include <msgpack.hpp>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>
#include <array>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstring>
#include <stdexcept>

// NamedUnion encoding: [name, payload] as a 2-element array
// For requests: [[name, payload]]
// For responses: [name, payload]

struct EchoInner {
    std::vector<std::vector<uint8_t>> values;
    std::optional<bool> flag;
    MSGPACK_DEFINE_MAP(values, flag)
};

struct EchoBytes {
    std::vector<uint8_t> data;
    MSGPACK_DEFINE_MAP(data)
};

struct EchoFields {
    uint32_t a;
    uint64_t b;
    std::string name;
    MSGPACK_DEFINE_MAP(a, b, name)
};

struct EchoNested {
    EchoInner inner;
    MSGPACK_DEFINE_MAP(inner)
};

// --- Framing helpers ---

inline void send_framed(int fd, const char* data, size_t len) {
    uint32_t net_len = static_cast<uint32_t>(len);
    // Little-endian
    uint8_t header[4] = {
        static_cast<uint8_t>(net_len & 0xFF),
        static_cast<uint8_t>((net_len >> 8) & 0xFF),
        static_cast<uint8_t>((net_len >> 16) & 0xFF),
        static_cast<uint8_t>((net_len >> 24) & 0xFF),
    };
    if (write(fd, header, 4) != 4) throw std::runtime_error("write header failed");
    size_t written = 0;
    while (written < len) {
        auto n = write(fd, data + written, len - written);
        if (n <= 0) throw std::runtime_error("write payload failed");
        written += static_cast<size_t>(n);
    }
}

inline std::vector<uint8_t> recv_framed(int fd) {
    uint8_t header[4];
    size_t got = 0;
    while (got < 4) {
        auto n = read(fd, header + got, 4 - got);
        if (n <= 0) throw std::runtime_error("read header failed");
        got += static_cast<size_t>(n);
    }
    uint32_t len = header[0] | (header[1] << 8) | (header[2] << 16) | (header[3] << 24);
    std::vector<uint8_t> buf(len);
    got = 0;
    while (got < len) {
        auto n = read(fd, buf.data() + got, len - got);
        if (n <= 0) throw std::runtime_error("read payload failed");
        got += static_cast<size_t>(n);
    }
    return buf;
}

// --- UDS helpers ---

inline int create_server_socket(const char* path) {
    unlink(path);
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) throw std::runtime_error("socket() failed");
    struct sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);
    if (bind(fd, (struct sockaddr*)&addr, sizeof(addr)) < 0) throw std::runtime_error("bind() failed");
    if (listen(fd, 1) < 0) throw std::runtime_error("listen() failed");
    return fd;
}

inline int connect_socket(const char* path) {
    int fd = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd < 0) throw std::runtime_error("socket() failed");
    struct sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, path, sizeof(addr.sun_path) - 1);
    if (connect(fd, (struct sockaddr*)&addr, sizeof(addr)) < 0) throw std::runtime_error("connect() failed");
    return fd;
}
