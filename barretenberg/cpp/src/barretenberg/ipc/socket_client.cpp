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

ssize_t SocketClient::recv(void* buffer, size_t max_len, uint64_t /*timeout_ns*/)
{
    if (fd_ < 0) {
        errno = EINVAL;
        return -1;
    }

    // Read length prefix (4 bytes)
    uint32_t msg_len = 0;
    ssize_t n = ::recv(fd_, &msg_len, sizeof(msg_len), MSG_WAITALL);
    if (n < 0 || static_cast<size_t>(n) != sizeof(msg_len)) {
        return -1;
    }

    if (msg_len > max_len) {
        errno = EMSGSIZE;
        return -1;
    }

    // Read message data
    n = ::recv(fd_, buffer, msg_len, MSG_WAITALL);
    if (n < 0) {
        return -1;
    }
    const auto bytes_received = static_cast<size_t>(n);
    if (bytes_received != msg_len) {
        return -1;
    }

    return n;
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
