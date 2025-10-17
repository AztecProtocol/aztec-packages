#include "barretenberg/ipc/socket_server.hpp"
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <string>
#include <sys/epoll.h>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/un.h>
#include <unistd.h>
#include <utility>

namespace bb::ipc {

SocketServer::SocketServer(std::string socket_path, int initial_max_clients)
    : socket_path_(std::move(socket_path))
    , initial_max_clients_(initial_max_clients)
{
    client_fds_.reserve(initial_max_clients > 0 ? static_cast<size_t>(initial_max_clients) : 10);
}

SocketServer::~SocketServer()
{
    close_internal();
}

bool SocketServer::listen()
{
    if (listen_fd_ >= 0) {
        return true; // Already listening
    }

    // Remove any existing socket file
    ::unlink(socket_path_.c_str());

    // Create socket
    listen_fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
    if (listen_fd_ < 0) {
        return false;
    }

    // Bind to path
    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, socket_path_.c_str(), sizeof(addr.sun_path) - 1);

    if (bind(listen_fd_, reinterpret_cast<struct sockaddr*>(&addr), sizeof(addr)) < 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
        return false;
    }

    // Listen with backlog
    int backlog = initial_max_clients_ > 0 ? initial_max_clients_ : 10;
    if (::listen(listen_fd_, backlog) < 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return false;
    }

    // Create epoll instance
    epoll_fd_ = epoll_create1(0);
    if (epoll_fd_ < 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return false;
    }

    // Add listen socket to epoll
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = listen_fd_;
    if (epoll_ctl(epoll_fd_, EPOLL_CTL_ADD, listen_fd_, &ev) < 0) {
        ::close(epoll_fd_);
        epoll_fd_ = -1;
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return false;
    }

    return true;
}

int SocketServer::accept(uint64_t timeout_ns)
{
    if (listen_fd_ < 0) {
        errno = EINVAL;
        return -1;
    }

    // Wait for connection
    struct epoll_event ev;
    int timeout_ms = -1; // default: infinite
    if (timeout_ns > 0) {
        timeout_ms = static_cast<int>(timeout_ns / 1000000);
    } else if (timeout_ns == 0) {
        timeout_ms = 0;
    }
    int n = epoll_wait(epoll_fd_, &ev, 1, timeout_ms);
    if (n <= 0) {
        return -1;
    }

    if (ev.data.fd != listen_fd_) {
        errno = EINVAL;
        return -1;
    }

    // Accept connection
    int client_fd = ::accept(listen_fd_, nullptr, nullptr);
    if (client_fd < 0) {
        return -1;
    }

    // Find free slot (or allocate new one)
    int client_id = find_free_slot();

    // Store client fd
    const auto client_id_unsigned = static_cast<size_t>(client_id);
    if (client_id_unsigned >= client_fds_.size()) {
        client_fds_.resize(client_id_unsigned + 1, -1);
    }
    client_fds_[static_cast<size_t>(client_id)] = client_fd;
    fd_to_client_id_[client_fd] = client_id;
    num_clients_++;

    // Add client to epoll
    ev.events = EPOLLIN;
    ev.data.fd = client_fd;
    if (epoll_ctl(epoll_fd_, EPOLL_CTL_ADD, client_fd, &ev) < 0) {
        disconnect_client(client_id);
        return -1;
    }

    return client_id;
}

int SocketServer::wait_for_data(uint64_t timeout_ns)
{
    if (epoll_fd_ < 0) {
        errno = EINVAL;
        return -1;
    }

    struct epoll_event ev;
    int timeout_ms = timeout_ns > 0 ? static_cast<int>(timeout_ns / 1000000) : -1;
    int n = epoll_wait(epoll_fd_, &ev, 1, timeout_ms);
    if (n <= 0) {
        return -1;
    }

    // Check if it's listen socket (new connection) or client data
    if (ev.data.fd == listen_fd_) {
        errno = EAGAIN; // Signal caller to call accept
        return -1;
    }

    // Find which client
    auto it = fd_to_client_id_.find(ev.data.fd);
    if (it == fd_to_client_id_.end()) {
        errno = ENOENT;
        return -1;
    }

    return it->second;
}

ssize_t SocketServer::recv(int client_id, void* buffer, size_t max_len)
{
    if (client_id < 0 || static_cast<size_t>(client_id) >= client_fds_.size() ||
        client_fds_[static_cast<size_t>(client_id)] < 0) {
        errno = EINVAL;
        return -1;
    }

    int fd = client_fds_[static_cast<size_t>(client_id)];

    // Read length prefix (4 bytes)
    uint32_t msg_len = 0;
    ssize_t n = ::recv(fd, &msg_len, sizeof(msg_len), MSG_WAITALL);
    if (n < 0 || static_cast<size_t>(n) != sizeof(msg_len)) {
        if (n == 0) {
            // Client disconnected
            disconnect_client(client_id);
        }
        return -1;
    }

    if (msg_len > max_len) {
        errno = EMSGSIZE;
        return -1;
    }

    // Read message data
    n = ::recv(fd, buffer, msg_len, MSG_WAITALL);
    if (n < 0) {
        disconnect_client(client_id);
        return -1;
    }
    const auto bytes_received = static_cast<size_t>(n);
    if (bytes_received != msg_len) {
        disconnect_client(client_id);
        return -1;
    }

    return n;
}

bool SocketServer::send(int client_id, const void* data, size_t len)
{
    if (client_id < 0 || static_cast<size_t>(client_id) >= client_fds_.size() ||
        client_fds_[static_cast<size_t>(client_id)] < 0) {
        errno = EINVAL;
        return false;
    }

    int fd = client_fds_[static_cast<size_t>(client_id)];

    // Send length prefix (4 bytes)
    auto msg_len = static_cast<uint32_t>(len);
    ssize_t n = ::send(fd, &msg_len, sizeof(msg_len), 0);
    if (n < 0 || static_cast<size_t>(n) != sizeof(msg_len)) {
        return false;
    }

    // Send message data
    n = ::send(fd, data, len, 0);
    if (n < 0) {
        return false;
    }
    const auto bytes_sent = static_cast<size_t>(n);
    return bytes_sent == len;
}

void SocketServer::close()
{
    close_internal();
}

void SocketServer::close_internal()
{
    // Close all client connections
    for (int fd : client_fds_) {
        if (fd >= 0) {
            ::close(fd);
        }
    }
    client_fds_.clear();
    fd_to_client_id_.clear();
    num_clients_ = 0;

    if (epoll_fd_ >= 0) {
        ::close(epoll_fd_);
        epoll_fd_ = -1;
    }

    if (listen_fd_ >= 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
    }

    // Clean up socket file
    ::unlink(socket_path_.c_str());
}

void SocketServer::disconnect_client(int client_id)
{
    if (client_id < 0 || static_cast<size_t>(client_id) >= client_fds_.size()) {
        return;
    }

    int fd = client_fds_[static_cast<size_t>(client_id)];
    if (fd >= 0) {
        epoll_ctl(epoll_fd_, EPOLL_CTL_DEL, fd, nullptr);
        ::close(fd);
        fd_to_client_id_.erase(fd);
        client_fds_[static_cast<size_t>(client_id)] = -1;
        num_clients_--;
    }
}

int SocketServer::find_free_slot()
{
    // Look for existing free slot
    for (size_t i = 0; i < client_fds_.size(); i++) {
        if (client_fds_[i] == -1) {
            return static_cast<int>(i);
        }
    }

    // No free slot found, allocate new one at end
    return static_cast<int>(client_fds_.size());
}

} // namespace bb::ipc
