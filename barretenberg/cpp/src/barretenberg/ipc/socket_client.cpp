#include "barretenberg/ipc/socket_client.hpp"
#include <cerrno>
#include <cstring>
#include <sys/socket.h>
#include <sys/un.h>
#include <unistd.h>

namespace bb::ipc {

SocketClient::SocketClient(std::string socket_path)
    : socket_path_(std::move(socket_path))
{}

SocketClient::~SocketClient()
{
    close();
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
    if (n != sizeof(msg_len)) {
        return false;
    }

    // Send message data
    n = ::send(fd_, data, len, 0);
    if (n != static_cast<ssize_t>(len)) {
        return false;
    }

    return true;
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
    if (n != sizeof(msg_len)) {
        return -1;
    }

    if (msg_len > max_len) {
        errno = EMSGSIZE;
        return -1;
    }

    // Read message data
    n = ::recv(fd_, buffer, msg_len, MSG_WAITALL);
    if (n != static_cast<ssize_t>(msg_len)) {
        return -1;
    }

    return n;
}

void SocketClient::close()
{
    if (fd_ >= 0) {
        ::close(fd_);
        fd_ = -1;
    }
}

} // namespace bb::ipc
