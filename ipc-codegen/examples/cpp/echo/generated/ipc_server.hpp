/**
 * Generic IPC server over Unix Domain Sockets.
 * Handles: socket setup, multi-client accept via poll(), length-prefixed framing.
 * Service-specific dispatch is injected via the handler function parameter.
 *
 * Does NOT handle signal handling or parent death monitoring — those are
 * the responsibility of the binary that calls serve().
 *
 * Header-only — no separate .cpp needed.
 */
#pragma once
#ifndef IPC_SERVER_HPP_INCLUDED
#define IPC_SERVER_HPP_INCLUDED

#include <atomic>
#include <cstdint>
#include <functional>
#include <stdexcept>
#include <string>
#include <vector>

#if defined(__wasm__)
// UDS not available in WASM — provide stub types only
namespace ipc {
struct ShutdownRequested : std::exception {
    std::vector<uint8_t> final_response;
    explicit ShutdownRequested(std::vector<uint8_t> resp) : final_response(std::move(resp)) {}
    const char* what() const noexcept override { return "shutdown requested"; }
};
using Handler = std::function<std::vector<uint8_t>(const std::vector<uint8_t>&)>;
inline void serve(const char*, Handler, std::atomic<bool>* = nullptr, int = 5) {}
} // namespace ipc
#else

#ifndef THROW
#define THROW throw
#endif
#ifndef RETHROW
#define RETHROW throw
#endif

#include <atomic>
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <functional>
#include <iostream>
#include <stdexcept>
#include <string>
#include <vector>

#include <poll.h>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace ipc {

/// Exception thrown by handlers to trigger graceful shutdown.
/// Carries the final response to send before closing.
struct ShutdownRequested : std::exception {
    std::vector<uint8_t> final_response;
    explicit ShutdownRequested(std::vector<uint8_t> resp)
        : final_response(std::move(resp))
    {}
    const char* what() const noexcept override { return "shutdown requested"; }
};

using Handler = std::function<std::vector<uint8_t>(const std::vector<uint8_t>&)>;

// ---------------------------------------------------------------------------
// Framing: 4-byte little-endian length prefix
// ---------------------------------------------------------------------------

inline bool send_frame(int fd, const std::vector<uint8_t>& data)
{
    uint32_t len = static_cast<uint32_t>(data.size());
    uint8_t header[4] = {
        static_cast<uint8_t>(len & 0xFF),
        static_cast<uint8_t>((len >> 8) & 0xFF),
        static_cast<uint8_t>((len >> 16) & 0xFF),
        static_cast<uint8_t>((len >> 24) & 0xFF),
    };
    // Write header
    size_t written = 0;
    while (written < 4) {
        auto n = ::write(fd, header + written, 4 - written);
        if (n <= 0) {
            return false;
        }
        written += static_cast<size_t>(n);
    }
    // Write payload
    written = 0;
    while (written < data.size()) {
        auto n = ::write(fd, data.data() + written, data.size() - written);
        if (n <= 0) {
            return false;
        }
        written += static_cast<size_t>(n);
    }
    return true;
}

/// Returns empty vector on EOF/error.
inline std::vector<uint8_t> recv_frame(int fd)
{
    uint8_t header[4];
    size_t got = 0;
    while (got < 4) {
        auto n = ::read(fd, header + got, 4 - got);
        if (n <= 0) {
            return {};
        }
        got += static_cast<size_t>(n);
    }
    uint32_t len = static_cast<uint32_t>(header[0]) | (static_cast<uint32_t>(header[1]) << 8) |
                   (static_cast<uint32_t>(header[2]) << 16) | (static_cast<uint32_t>(header[3]) << 24);
    std::vector<uint8_t> buf(len);
    got = 0;
    while (got < len) {
        auto n = ::read(fd, buf.data() + got, len - got);
        if (n <= 0) {
            return {};
        }
        got += static_cast<size_t>(n);
    }
    return buf;
}

// ---------------------------------------------------------------------------
// Multi-client UDS server
// ---------------------------------------------------------------------------

/**
 * @brief Run a multi-client UDS server.
 *
 * Accepts multiple client connections via poll(). Handles one request at a time
 * (sequential, not concurrent). When a handler throws ShutdownRequested, the
 * final response is sent and the server exits cleanly.
 *
 * The caller should set up signal handlers and parent death monitoring before
 * calling this function. To request external shutdown, store true into the
 * provided shutdown_flag (or pass nullptr to disable external shutdown).
 *
 * @param socket_path   Path for the Unix domain socket
 * @param handler       Function that processes a request and returns a response
 * @param shutdown_flag Atomic flag checked each poll cycle; serve() exits when true.
 *                      May be nullptr if only ShutdownRequested is used.
 * @param backlog       listen() backlog (max pending connections)
 */
inline void serve(const char* socket_path,
                  Handler handler,
                  std::atomic<bool>* shutdown_flag = nullptr,
                  int backlog = 5)
{
    unlink(socket_path);
    int server_fd = ::socket(AF_UNIX, SOCK_STREAM, 0);
    if (server_fd < 0) {
        throw std::runtime_error(std::string("socket() failed: ") + strerror(errno));
    }

    struct sockaddr_un addr {};
    addr.sun_family = AF_UNIX;
    strncpy(addr.sun_path, socket_path, sizeof(addr.sun_path) - 1);

    if (::bind(server_fd, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(server_fd);
        throw std::runtime_error(std::string("bind() failed: ") + strerror(errno));
    }
    if (::listen(server_fd, backlog) < 0) {
        ::close(server_fd);
        throw std::runtime_error(std::string("listen() failed: ") + strerror(errno));
    }

    // Poll set: [0] = server_fd, [1..N] = client fds
    std::vector<struct pollfd> fds;
    fds.push_back({ server_fd, POLLIN, 0 });

    auto remove_client = [&](size_t idx) {
        ::close(fds[idx].fd);
        fds.erase(fds.begin() + static_cast<ptrdiff_t>(idx));
    };

    auto should_shutdown = [&]() {
        return shutdown_flag != nullptr && shutdown_flag->load(std::memory_order_acquire);
    };

    while (!should_shutdown()) {
        int ready = ::poll(fds.data(), static_cast<nfds_t>(fds.size()), 100 /* ms */);
        if (ready < 0) {
            if (errno == EINTR) {
                continue;
            }
            break;
        }
        if (ready == 0) {
            continue;
        }

        // Check server fd for new connections
        if (fds[0].revents & POLLIN) {
            int client_fd = ::accept(server_fd, nullptr, nullptr);
            if (client_fd >= 0) {
                fds.push_back({ client_fd, POLLIN, 0 });
            }
        }

        // Check client fds for data
        for (size_t i = 1; i < fds.size(); /* incremented below */) {
            if (!(fds[i].revents & POLLIN)) {
                ++i;
                continue;
            }

            auto payload = recv_frame(fds[i].fd);
            if (payload.empty()) {
                // Client disconnected
                remove_client(i);
                continue;
            }

            try {
                auto response = handler(payload);
                if (!send_frame(fds[i].fd, response)) {
                    remove_client(i);
                    continue;
                }
            } catch (const ShutdownRequested& shutdown) {
                send_frame(fds[i].fd, shutdown.final_response);
                goto done;
            } catch (const std::exception& e) {
                std::cerr << "ipc-server: handler error: " << e.what() << "\n";
                remove_client(i);
                continue;
            }
            ++i;
        }
    }

done:
    // Close all client connections
    for (size_t i = 1; i < fds.size(); ++i) {
        ::close(fds[i].fd);
    }
    ::close(server_fd);
    unlink(socket_path);
}

} // namespace ipc
#endif // !defined(__wasm__)
#endif // IPC_SERVER_HPP_INCLUDED
