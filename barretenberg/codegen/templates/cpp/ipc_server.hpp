/**
 * Generic IPC server over Unix Domain Sockets.
 * Handles: socket setup, accept, length-prefixed framing, msgpack decode/encode.
 * Service-specific dispatch is injected via the handler function parameter.
 *
 * Header-only — no separate .cpp needed.
 */
#pragma once

#ifndef THROW
#define THROW throw
#endif
#ifndef RETHROW
#define RETHROW throw
#endif

#include <msgpack.hpp>
#include <cstdint>
#include <functional>
#include <iostream>
#include <string>
#include <vector>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstring>

namespace ipc {

using Handler = std::function<std::vector<uint8_t>(const std::vector<uint8_t>&)>;

inline void send_frame(int fd, const std::vector<uint8_t>& data) {
    uint32_t len = static_cast<uint32_t>(data.size());
    uint8_t header[4] = {
        static_cast<uint8_t>(len & 0xFF),
        static_cast<uint8_t>((len >> 8) & 0xFF),
        static_cast<uint8_t>((len >> 16) & 0xFF),
        static_cast<uint8_t>((len >> 24) & 0xFF),
    };
    write(fd, header, 4);
    size_t written = 0;
    while (written < data.size()) {
        auto n = write(fd, data.data() + written, data.size() - written);
        if (n <= 0) break;
        written += static_cast<size_t>(n);
    }
}

inline std::vector<uint8_t> recv_frame(int fd) {
    uint8_t header[4];
    size_t got = 0;
    while (got < 4) {
        auto n = read(fd, header + got, 4 - got);
        if (n <= 0) throw std::runtime_error("read failed");
        got += static_cast<size_t>(n);
    }
    uint32_t len = header[0] | (header[1] << 8) | (header[2] << 16) | (header[3] << 24);
    std::vector<uint8_t> buf(len);
    got = 0;
    while (got < len) {
        auto n = read(fd, buf.data() + got, len - got);
        if (n <= 0) throw std::runtime_error("read failed");
        got += static_cast<size_t>(n);
    }
    return buf;
}

inline void serve(const char* socket_path, Handler handler) {
    unlink(socket_path);
    int server_fd = socket(AF_UNIX, SOCK_STREAM, 0);
    struct sockaddr_un addr{};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, socket_path, sizeof(addr.sun_path) - 1);
    bind(server_fd, (struct sockaddr*)&addr, sizeof(addr));
    listen(server_fd, 1);
    std::cerr << "ipc-server(cpp): listening on " << socket_path << "\n";

    int client_fd = accept(server_fd, nullptr, nullptr);

    while (true) {
        std::vector<uint8_t> payload;
        try {
            payload = recv_frame(client_fd);
        } catch (...) {
            break;
        }

        bool is_shutdown = false;
        for (size_t i = 0; i + 8 <= payload.size(); i++) {
            if (std::memcmp(payload.data() + i, "Shutdown", 8) == 0) {
                is_shutdown = true;
                break;
            }
        }

        auto response = handler(payload);
        send_frame(client_fd, response);

        if (is_shutdown) break;
    }

    close(client_fd);
    close(server_fd);
    unlink(socket_path);
    std::cerr << "ipc-server(cpp): shutdown\n";
}

} // namespace ipc
