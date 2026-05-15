/**
 * Generic IPC client over Unix Domain Sockets.
 * Handles: socket connect, length-prefixed framing, send/receive raw bytes.
 * Header-only.
 */
#pragma once
#ifndef IPC_CLIENT_HPP_INCLUDED
#define IPC_CLIENT_HPP_INCLUDED

#ifndef THROW
#define THROW throw
#endif
#ifndef RETHROW
#define RETHROW throw
#endif

#include <cerrno>
#include <cstdint>
#include <cstring>
#include <stdexcept>
#include <string>
#include <vector>

#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace ipc {

class IpcClient {
  public:
    explicit IpcClient(const char* socket_path)
    {
        fd_ = ::socket(AF_UNIX, SOCK_STREAM, 0);
        if (fd_ < 0) {
            throw std::runtime_error(std::string("socket() failed: ") + strerror(errno));
        }
        struct sockaddr_un addr {};
        addr.sun_family = AF_UNIX;
        strncpy(addr.sun_path, socket_path, sizeof(addr.sun_path) - 1);
        if (::connect(fd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
            ::close(fd_);
            fd_ = -1;
            throw std::runtime_error(std::string("connect() failed: ") + strerror(errno));
        }
    }

    ~IpcClient()
    {
        if (fd_ >= 0) {
            ::close(fd_);
        }
    }

    IpcClient(const IpcClient&) = delete;
    IpcClient& operator=(const IpcClient&) = delete;

    std::vector<uint8_t> call(const std::vector<uint8_t>& request)
    {
        // Send length-prefixed request
        uint32_t len = static_cast<uint32_t>(request.size());
        uint8_t header[4] = {
            static_cast<uint8_t>(len & 0xFF),
            static_cast<uint8_t>((len >> 8) & 0xFF),
            static_cast<uint8_t>((len >> 16) & 0xFF),
            static_cast<uint8_t>((len >> 24) & 0xFF),
        };
        write_all(header, 4);
        write_all(request.data(), request.size());

        // Receive length-prefixed response
        uint8_t resp_hdr[4];
        read_all(resp_hdr, 4);
        uint32_t resp_len = static_cast<uint32_t>(resp_hdr[0]) | (static_cast<uint32_t>(resp_hdr[1]) << 8) |
                            (static_cast<uint32_t>(resp_hdr[2]) << 16) | (static_cast<uint32_t>(resp_hdr[3]) << 24);
        std::vector<uint8_t> resp(resp_len);
        read_all(resp.data(), resp_len);
        return resp;
    }

  private:
    void write_all(const void* data, size_t len)
    {
        const auto* ptr = static_cast<const uint8_t*>(data);
        size_t written = 0;
        while (written < len) {
            auto n = ::write(fd_, ptr + written, len - written);
            if (n <= 0) {
                throw std::runtime_error("write failed");
            }
            written += static_cast<size_t>(n);
        }
    }

    void read_all(void* data, size_t len)
    {
        auto* ptr = static_cast<uint8_t*>(data);
        size_t got = 0;
        while (got < len) {
            auto n = ::read(fd_, ptr + got, len - got);
            if (n <= 0) {
                throw std::runtime_error("read failed");
            }
            got += static_cast<size_t>(n);
        }
    }

    int fd_ = -1;
};

} // namespace ipc
#endif // IPC_CLIENT_HPP_INCLUDED
