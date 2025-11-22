#include "barretenberg/ipc/socket_server.hpp"
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <span>
#include <string>
#include <sys/socket.h>
#include <sys/types.h>
#include <sys/un.h>
#include <unistd.h>
#include <utility>

// Platform-specific event notification includes
#ifdef __APPLE__
#include <sys/event.h> // kqueue on macOS/BSD
#else
#include <sys/epoll.h> // epoll on Linux
#endif

namespace bb::ipc {

SocketServer::SocketServer(std::string socket_path, int initial_max_clients)
    : socket_path_(std::move(socket_path))
    , initial_max_clients_(initial_max_clients)
{
    const size_t reserve_size = initial_max_clients > 0 ? static_cast<size_t>(initial_max_clients) : 10;
    client_fds_.reserve(reserve_size);
    recv_buffers_.reserve(reserve_size);
}

SocketServer::~SocketServer()
{
    close_internal();
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

    if (fd_ >= 0) {
        ::close(fd_);
        fd_ = -1;
    }

    if (listen_fd_ >= 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
    }

    // Clean up socket file
    ::unlink(socket_path_.c_str());
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

void SocketServer::release(int client_id, size_t message_size)
{
    // No-op for sockets - message already consumed from kernel buffer during receive()
    (void)client_id;
    (void)message_size;
}

std::span<const uint8_t> SocketServer::receive(int client_id)
{
    if (client_id < 0 || static_cast<size_t>(client_id) >= client_fds_.size() ||
        client_fds_[static_cast<size_t>(client_id)] < 0) {
        return {};
    }

    int fd = client_fds_[static_cast<size_t>(client_id)];
    const auto client_idx = static_cast<size_t>(client_id);

    // Ensure buffers are sized for this client
    if (client_idx >= recv_buffers_.size()) {
        recv_buffers_.resize(client_idx + 1);
    }

    // Read length prefix (4 bytes) - must loop until all bytes received (MSG_WAITALL unreliable on macOS)
    uint32_t msg_len = 0;
    size_t total_read = 0;
    while (total_read < sizeof(msg_len)) {
        ssize_t n = ::recv(fd, reinterpret_cast<uint8_t*>(&msg_len) + total_read, sizeof(msg_len) - total_read, 0);
        if (n < 0) {
            if (errno == EINTR) {
                continue; // Interrupted, retry
            }
            return {};
        }
        if (n == 0) {
            // Client disconnected
            disconnect_client(client_id);
            return {};
        }
        total_read += static_cast<size_t>(n);
    }

    // Resize buffer if needed to fit length prefix + message
    size_t total_size = sizeof(uint32_t) + msg_len;
    if (recv_buffers_[client_idx].size() < total_size) {
        recv_buffers_[client_idx].resize(total_size);
    }

    // Store length prefix in buffer
    std::memcpy(recv_buffers_[client_idx].data(), &msg_len, sizeof(uint32_t));

    // Read message data - must loop until all bytes received (MSG_WAITALL unreliable on macOS)
    total_read = 0;
    while (total_read < msg_len) {
        ssize_t n =
            ::recv(fd, recv_buffers_[client_idx].data() + sizeof(uint32_t) + total_read, msg_len - total_read, 0);
        if (n < 0) {
            if (errno == EINTR) {
                continue; // Interrupted, retry
            }
            disconnect_client(client_id);
            return {};
        }
        if (n == 0) {
            // Client disconnected mid-message
            disconnect_client(client_id);
            return {};
        }
        total_read += static_cast<size_t>(n);
    }

    return std::span<const uint8_t>(recv_buffers_[client_idx].data() + sizeof(uint32_t), msg_len);
}

#ifdef __APPLE__
// ============================================================================
// macOS Implementation (kqueue, blocking sockets, simple accept)
// ============================================================================

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

    // Set non-blocking mode (required for accept-until-EAGAIN pattern)
    int flags = fcntl(listen_fd_, F_GETFL, 0);
    if (flags < 0 || fcntl(listen_fd_, F_SETFL, flags | O_NONBLOCK) < 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
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

    // Create kqueue instance
    fd_ = kqueue();
    if (fd_ < 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return false;
    }

    // Add listen socket to kqueue
    struct kevent ev;
    EV_SET(&ev, listen_fd_, EVFILT_READ, EV_ADD | EV_ENABLE, 0, 0, nullptr);
    if (kevent(fd_, &ev, 1, nullptr, 0, nullptr) < 0) {
        ::close(fd_);
        fd_ = -1;
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return false;
    }

    return true;
}

int SocketServer::accept()
{
    if (listen_fd_ < 0) {
        errno = EINVAL;
        return -1;
    }

    // Accept all pending connections (loop until EAGAIN)
    // Non-blocking socket ensures this returns immediately
    int last_client_id = -1;

    while (true) {
        int client_fd = ::accept(listen_fd_, nullptr, nullptr);

        if (client_fd < 0) {
            // Check if this is expected (no more connections) or a real error
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // No more pending connections - expected, break
                break;
            }
            // Real error - but if we already accepted some, return success
            if (last_client_id >= 0) {
                break;
            }
            // No connections accepted and got real error
            return -1;
        }

        // Set client socket to BLOCKING mode (inherited non-blocking from listen socket)
        // This avoids busy-waiting in recv() - we only recv after kqueue signals data ready
        int flags = fcntl(client_fd, F_GETFL, 0);
        if (flags >= 0) {
            fcntl(client_fd, F_SETFL, flags & ~O_NONBLOCK);
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

        // Add client to kqueue
        struct kevent kev;
        EV_SET(&kev, client_fd, EVFILT_READ, EV_ADD | EV_ENABLE, 0, 0, nullptr);
        if (kevent(fd_, &kev, 1, nullptr, 0, nullptr) < 0) {
            disconnect_client(client_id);
            // Continue trying to accept other pending connections
            continue;
        }

        last_client_id = client_id;
    }

    return last_client_id;
}

int SocketServer::wait_for_data(uint64_t timeout_ns)
{
    if (fd_ < 0) {
        errno = EINVAL;
        return -1;
    }

    struct kevent ev;
    struct timespec timeout;
    struct timespec* timeout_ptr = nullptr;

    if (timeout_ns > 0) {
        timeout.tv_sec = static_cast<time_t>(timeout_ns / 1000000000ULL);
        timeout.tv_nsec = static_cast<long>(timeout_ns % 1000000000ULL);
        timeout_ptr = &timeout;
    } else if (timeout_ns == 0) {
        timeout.tv_sec = 0;
        timeout.tv_nsec = 0;
        timeout_ptr = &timeout;
    }

    int n = kevent(fd_, nullptr, 0, &ev, 1, timeout_ptr);
    if (n <= 0) {
        return -1;
    }

    int ready_fd = static_cast<int>(ev.ident);

    // Check if it's listen socket (new connection) or client data
    if (ready_fd == listen_fd_) {
        errno = EAGAIN; // Signal caller to call accept
        return -1;
    }

    // Find which client
    auto it = fd_to_client_id_.find(ready_fd);
    if (it == fd_to_client_id_.end()) {
        errno = ENOENT;
        return -1;
    }

    return it->second;
}

void SocketServer::disconnect_client(int client_id)
{
    if (client_id < 0 || static_cast<size_t>(client_id) >= client_fds_.size()) {
        return;
    }

    int fd = client_fds_[static_cast<size_t>(client_id)];
    if (fd >= 0) {
        // For kqueue, we don't need explicit deletion - closing the fd removes it automatically
        // But we can explicitly remove it for clarity
        struct kevent ev;
        EV_SET(&ev, fd, EVFILT_READ, EV_DELETE, 0, 0, nullptr);
        kevent(fd_, &ev, 1, nullptr, 0, nullptr);

        ::close(fd);
        fd_to_client_id_.erase(fd);
        client_fds_[static_cast<size_t>(client_id)] = -1;
        num_clients_--;
    }
}

#else

// ============================================================================
// Linux Implementation (epoll, non-blocking sockets, accept-until-EAGAIN)
// ============================================================================

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

    // Set non-blocking mode (required for accept-until-EAGAIN pattern)
    int flags = fcntl(listen_fd_, F_GETFL, 0);
    if (flags < 0 || fcntl(listen_fd_, F_SETFL, flags | O_NONBLOCK) < 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
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
    fd_ = epoll_create1(0);
    if (fd_ < 0) {
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return false;
    }

    // Add listen socket to epoll
    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = listen_fd_;
    if (epoll_ctl(fd_, EPOLL_CTL_ADD, listen_fd_, &ev) < 0) {
        ::close(fd_);
        fd_ = -1;
        ::close(listen_fd_);
        listen_fd_ = -1;
        ::unlink(socket_path_.c_str());
        return false;
    }

    return true;
}

int SocketServer::accept()
{
    if (listen_fd_ < 0) {
        errno = EINVAL;
        return -1;
    }

    // Accept all pending connections (loop until EAGAIN)
    // Non-blocking socket ensures this returns immediately
    int last_client_id = -1;

    while (true) {
        int client_fd = ::accept(listen_fd_, nullptr, nullptr);

        if (client_fd < 0) {
            // Check if this is expected (no more connections) or a real error
            if (errno == EAGAIN || errno == EWOULDBLOCK) {
                // No more pending connections - expected, break
                break;
            }
            // Real error - but if we already accepted some, return success
            if (last_client_id >= 0) {
                break;
            }
            // No connections accepted and got real error
            return -1;
        }

        // Set client socket to BLOCKING mode (inherited non-blocking from listen socket)
        // This avoids busy-waiting in recv() - we only recv after epoll signals data ready
        int flags = fcntl(client_fd, F_GETFL, 0);
        if (flags >= 0) {
            fcntl(client_fd, F_SETFL, flags & ~O_NONBLOCK);
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
        struct epoll_event client_ev;
        client_ev.events = EPOLLIN;
        client_ev.data.fd = client_fd;
        if (epoll_ctl(fd_, EPOLL_CTL_ADD, client_fd, &client_ev) < 0) {
            disconnect_client(client_id);
            // Continue trying to accept other pending connections
            continue;
        }

        last_client_id = client_id;
    }

    return last_client_id;
}

int SocketServer::wait_for_data(uint64_t timeout_ns)
{
    if (fd_ < 0) {
        errno = EINVAL;
        return -1;
    }

    struct epoll_event ev;
    int timeout_ms = timeout_ns > 0 ? static_cast<int>(timeout_ns / 1000000) : -1;
    int n = epoll_wait(fd_, &ev, 1, timeout_ms);
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

void SocketServer::disconnect_client(int client_id)
{
    if (client_id < 0 || static_cast<size_t>(client_id) >= client_fds_.size()) {
        return;
    }

    int fd = client_fds_[static_cast<size_t>(client_id)];
    if (fd >= 0) {
        epoll_ctl(fd_, EPOLL_CTL_DEL, fd, nullptr);
        ::close(fd);
        fd_to_client_id_.erase(fd);
        client_fds_[static_cast<size_t>(client_id)] = -1;
        num_clients_--;
    }
}

#endif

} // namespace bb::ipc
