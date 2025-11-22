#include "barretenberg/ipc/socket_client.hpp"
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <string>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/un.h>
#include <unistd.h>
#include <utility>

namespace bb::ipc {

SocketClient::SocketClient(std::string socket_path)
    : socket_path_(std::move(socket_path))
{}

SocketClient::~SocketClient()
{
    close_internal();
}

bool SocketClient::connect()
{
    if (fd_ >= 0) {
        return true; // Already connected
    }

    // Create socket
    fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd_ < 0) {
        return false;
    }

    // Connect to server
    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, socket_path_.c_str(), sizeof(addr.sun_path) - 1);

    if (::connect(fd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(fd_);
        fd_ = -1;
        return false;
    }

    return true;
}

bool SocketClient::send(const void* data, size_t len, uint64_t /*timeout_ns*/)
{
    if (fd_ < 0) {
        errno = EINVAL;
        return false;
    }

    // Send length prefix (4 bytes, little-endian)
    auto msg_len = static_cast<uint32_t>(len);
    ssize_t n = ::send(fd_, &msg_len, sizeof(msg_len), 0);
    if (n < 0 || static_cast<size_t>(n) != sizeof(msg_len)) {
        return false;
    }

    // Send message data
    n = ::send(fd_, data, len, 0);
    if (n < 0) {
        return false;
    }
    const auto bytes_sent = static_cast<size_t>(n);
    return bytes_sent == len;
}

std::span<const uint8_t> SocketClient::recv(uint64_t /*timeout_ns*/)
{
    if (fd_ < 0) {
        return {};
    }

    // Read length prefix (4 bytes)
    uint32_t msg_len = 0;
    ssize_t n = ::recv(fd_, &msg_len, sizeof(msg_len), MSG_WAITALL);
    if (n < 0 || static_cast<size_t>(n) != sizeof(msg_len)) {
        return {};
    }

    // Ensure buffer is large enough
    if (recv_buffer_.size() < msg_len) {
        recv_buffer_.resize(msg_len);
    }

    // Read message data into internal buffer
    n = ::recv(fd_, recv_buffer_.data(), msg_len, MSG_WAITALL);
    if (n < 0 || static_cast<size_t>(n) != msg_len) {
        return {};
    }

    // Return span into internal buffer
    return std::span<const uint8_t>(recv_buffer_.data(), msg_len);
}

void SocketClient::release(size_t /*message_size*/)
{
    // No-op for sockets - data is already consumed from kernel buffer during recv()
}

void SocketClient::close()
{
    close_internal();
}

void SocketClient::close_internal()
{
    if (fd_ >= 0) {
        ::close(fd_);
        fd_ = -1;
    }
}

} // namespace bb::ipc
