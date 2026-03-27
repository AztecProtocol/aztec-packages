/**
 * Generic IPC client over Unix Domain Sockets.
 * Handles: socket connect, length-prefixed framing, send/receive raw bytes.
 * Header-only.
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
#include <stdexcept>
#include <string>
#include <vector>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>
#include <cstring>

namespace ipc {

class IpcClient {
  public:
    explicit IpcClient(const char* socket_path) {
        fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
        if (fd_ < 0) throw std::runtime_error("socket() failed");
        struct sockaddr_un addr{};
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, socket_path, sizeof(addr.sun_path) - 1);
        if (connect(fd_, (struct sockaddr*)&addr, sizeof(addr)) < 0)
            throw std::runtime_error("connect() failed");
    }

    ~IpcClient() { if (fd_ >= 0) close(fd_); }

    IpcClient(const IpcClient&) = delete;
    IpcClient& operator=(const IpcClient&) = delete;

    std::vector<uint8_t> call(const std::vector<uint8_t>& request) {
        // Send
        uint32_t len = static_cast<uint32_t>(request.size());
        uint8_t header[4] = {
            static_cast<uint8_t>(len & 0xFF),
            static_cast<uint8_t>((len >> 8) & 0xFF),
            static_cast<uint8_t>((len >> 16) & 0xFF),
            static_cast<uint8_t>((len >> 24) & 0xFF),
        };
        write(fd_, header, 4);
        write(fd_, request.data(), request.size());

        // Receive
        uint8_t resp_hdr[4];
        size_t got = 0;
        while (got < 4) {
            auto n = read(fd_, resp_hdr + got, 4 - got);
            if (n <= 0) throw std::runtime_error("read failed");
            got += static_cast<size_t>(n);
        }
        uint32_t resp_len = resp_hdr[0] | (resp_hdr[1] << 8) | (resp_hdr[2] << 16) | (resp_hdr[3] << 24);
        std::vector<uint8_t> resp(resp_len);
        got = 0;
        while (got < resp_len) {
            auto n = read(fd_, resp.data() + got, resp_len - got);
            if (n <= 0) throw std::runtime_error("read failed");
            got += static_cast<size_t>(n);
        }
        return resp;
    }

  private:
    int fd_ = -1;
};

} // namespace ipc
