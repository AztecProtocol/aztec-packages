#include "ipc_runtime/pipe_server.hpp"
#include "ipc_runtime/constants.hpp"
#include <algorithm>
#include <cerrno>
#include <climits>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <fcntl.h>
#include <poll.h>
#include <span>
#include <unistd.h>

namespace ipc {

PipeServer::PipeServer(int in_fd, int out_fd)
    : in_fd_(in_fd)
    , out_fd_(out_fd)
{}

PipeServer::~PipeServer()
{
    close_internal();
}

void PipeServer::close()
{
    close_internal();
}

void PipeServer::close_internal()
{
    connected_ = false;
    if (in_fd_ >= 0) {
        ::close(in_fd_);
        if (out_fd_ == in_fd_) {
            out_fd_ = -1;
        }
        in_fd_ = -1;
    }
    if (out_fd_ >= 0) {
        ::close(out_fd_);
        out_fd_ = -1;
    }
    if (wake_read_fd_ >= 0) {
        ::close(wake_read_fd_);
        wake_read_fd_ = -1;
    }
    if (wake_write_fd_ >= 0) {
        ::close(wake_write_fd_);
        wake_write_fd_ = -1;
    }
}

void PipeServer::disconnect()
{
    // The pipe is the connection and the connection is the server's lifetime:
    // peer EOF (or a mid-frame stream desync) means no further request can ever
    // arrive, so ask the serve loop to exit rather than spinning on a
    // permanently-readable EOF fd.
    connected_ = false;
    request_shutdown();
}

bool PipeServer::setup_wake_pipe()
{
    int fds[2];
    if (::pipe(fds) < 0) {
        return false;
    }
    // Both ends non-blocking + close-on-exec: the non-blocking read end bounds
    // drain_wake_pipe()'s loop, and the non-blocking write end keeps notify()
    // from ever blocking (a full pipe already means a wake is pending).
    for (int fd : fds) {
        int fl = fcntl(fd, F_GETFL, 0);
        if (fl < 0 || fcntl(fd, F_SETFL, fl | O_NONBLOCK) < 0) {
            ::close(fds[0]);
            ::close(fds[1]);
            return false;
        }
        int fdfl = fcntl(fd, F_GETFD, 0);
        if (fdfl >= 0) {
            fcntl(fd, F_SETFD, fdfl | FD_CLOEXEC);
        }
    }
    wake_read_fd_ = fds[0];
    wake_write_fd_ = fds[1];
    return true;
}

void PipeServer::drain_wake_pipe()
{
    if (wake_read_fd_ < 0) {
        return;
    }
    uint8_t buf[256];
    while (::read(wake_read_fd_, buf, sizeof(buf)) > 0) {
        // Non-blocking: drain everything so we don't spin on a stale wake.
    }
}

void PipeServer::notify()
{
    if (wake_write_fd_ < 0) {
        return;
    }
    // One byte is enough to make the read end readable; ignore EAGAIN (pipe
    // already full ⇒ a wake is already pending) so notify() never blocks.
    const uint8_t one = 1;
    [[maybe_unused]] ssize_t n = ::write(wake_write_fd_, &one, 1);
}

bool PipeServer::listen()
{
    if (connected_) {
        return true; // Already listening
    }
    if (in_fd_ < 0 || out_fd_ < 0 || fcntl(in_fd_, F_GETFD) < 0 || fcntl(out_fd_, F_GETFD) < 0) {
        errno = EBADF;
        return false;
    }
    if (wake_read_fd_ < 0 && !setup_wake_pipe()) {
        return false;
    }
    connected_ = true;
    return true;
}

int PipeServer::wait_for_data(uint64_t timeout_ns)
{
    if (!connected_) {
        errno = ENOTCONN;
        return -1;
    }

    // 0 = non-blocking poll (matches the interface doc and the socket
    // transport). Sub-millisecond timeouts round up to 1ms; large timeouts
    // clamp to INT_MAX ms.
    int timeout_ms = 0;
    if (timeout_ns > 0) {
        uint64_t ms = std::max<uint64_t>(1, timeout_ns / 1000000ULL);
        timeout_ms = static_cast<int>(std::min<uint64_t>(ms, INT_MAX));
    }

    struct pollfd fds[2];
    fds[0] = { .fd = in_fd_, .events = POLLIN, .revents = 0 };
    fds[1] = { .fd = wake_read_fd_, .events = POLLIN, .revents = 0 };

    int n = ::poll(fds, 2, timeout_ms);
    if (n <= 0) {
        return -1;
    }

    // Completion wakeup from notify(): drain the self-pipe and report "no client
    // request". The caller drains its completion queue on every wake.
    if ((fds[1].revents & POLLIN) != 0) {
        drain_wake_pipe();
        if ((fds[0].revents & (POLLIN | POLLHUP | POLLERR)) == 0) {
            return -1;
        }
    }

    // POLLHUP/POLLERR are reported readable too: read() will deliver any
    // remaining buffered bytes and then EOF, which receive() turns into a
    // disconnect.
    if ((fds[0].revents & (POLLIN | POLLHUP | POLLERR)) != 0) {
        return 0;
    }
    return -1;
}

std::span<const uint8_t> PipeServer::receive(int client_id, uint64_t& request_id)
{
    if (client_id != 0 || !connected_) {
        return {};
    }

    // Read length prefix (4 bytes), looping on partial reads.
    uint32_t msg_len = 0;
    size_t total_read = 0;
    while (total_read < sizeof(msg_len)) {
        ssize_t n = ::read(in_fd_, reinterpret_cast<uint8_t*>(&msg_len) + total_read, sizeof(msg_len) - total_read);
        if (n < 0) {
            if (errno == EINTR) {
                continue; // Interrupted, retry
            }
            return {};
        }
        if (n == 0) {
            // Peer closed the pipe.
            disconnect();
            return {};
        }
        total_read += static_cast<size_t>(n);
    }

    // A corrupt/malicious prefix must not drive the allocation below. A frame
    // shorter than the request-id field means the peer speaks the id-less
    // protocol — treat as a fatal desync rather than misparse.
    if (msg_len > MAX_FRAME_SIZE || msg_len < FRAME_ID_SIZE) {
        fprintf(stderr, "ipc: pipe peer sent an invalid frame (len=%u) — protocol mismatch?\n", msg_len);
        disconnect();
        return {};
    }

    // Read the request id (8 bytes, little-endian).
    request_id = 0;
    total_read = 0;
    while (total_read < FRAME_ID_SIZE) {
        ssize_t n = ::read(in_fd_, reinterpret_cast<uint8_t*>(&request_id) + total_read, FRAME_ID_SIZE - total_read);
        if (n <= 0) {
            if (n < 0 && errno == EINTR) {
                continue; // Interrupted, retry
            }
            disconnect();
            return {};
        }
        total_read += static_cast<size_t>(n);
    }
    msg_len -= static_cast<uint32_t>(FRAME_ID_SIZE);

    if (recv_buffer_.size() < msg_len || recv_buffer_.empty()) {
        // Keep at least one byte so data() is non-null for zero-length messages
        // (null data() signals failure).
        recv_buffer_.resize(std::max<size_t>(msg_len, 1));
    }

    total_read = 0;
    while (total_read < msg_len) {
        ssize_t n = ::read(in_fd_, recv_buffer_.data() + total_read, msg_len - total_read);
        if (n < 0) {
            if (errno == EINTR) {
                continue; // Interrupted, retry
            }
            disconnect();
            return {};
        }
        if (n == 0) {
            // Peer closed mid-message.
            disconnect();
            return {};
        }
        total_read += static_cast<size_t>(n);
    }

    return std::span<const uint8_t>(recv_buffer_.data(), msg_len);
}

void PipeServer::release(int client_id, size_t message_size)
{
    // No-op for pipes — the message was consumed from the kernel buffer during
    // receive().
    (void)client_id;
    (void)message_size;
}

bool PipeServer::send(int client_id, uint64_t request_id, const void* data, size_t len)
{
    if (client_id != 0 || !connected_ || out_fd_ < 0) {
        errno = EINVAL;
        return false;
    }
    if (len > MAX_FRAME_SIZE) {
        errno = EMSGSIZE;
        return false;
    }

    // Write length prefix (4 bytes), echoed request id (8 bytes), then message
    // data, looping on partial writes — a short write after the prefix would
    // permanently desync the stream. A closed peer yields EPIPE (SIGPIPE must
    // be ignored; see class comment).
    auto msg_len = static_cast<uint32_t>(FRAME_ID_SIZE + len);
    const uint8_t* parts[3] = { reinterpret_cast<const uint8_t*>(&msg_len),
                                reinterpret_cast<const uint8_t*>(&request_id),
                                static_cast<const uint8_t*>(data) };
    size_t part_lens[3] = { sizeof(msg_len), FRAME_ID_SIZE, len };
    for (int part = 0; part < 3; part++) {
        size_t total_sent = 0;
        while (total_sent < part_lens[part]) {
            ssize_t n = ::write(out_fd_, parts[part] + total_sent, part_lens[part] - total_sent);
            if (n < 0) {
                if (errno == EINTR) {
                    continue; // Interrupted, retry
                }
                if (part > 0 || total_sent > 0) {
                    // Frame partially on the wire — stream desynced.
                    disconnect();
                }
                return false;
            }
            total_sent += static_cast<size_t>(n);
        }
    }
    return true;
}

} // namespace ipc
