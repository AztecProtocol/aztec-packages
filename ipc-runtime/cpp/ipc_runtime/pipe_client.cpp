#include "ipc_runtime/pipe_client.hpp"
#include "ipc_runtime/constants.hpp"
#include <algorithm>
#include <cerrno>
#include <climits>
#include <cstdint>
#include <fcntl.h>
#include <poll.h>
#include <unistd.h>

namespace ipc {

PipeClient::PipeClient(int in_fd, int out_fd)
    : in_fd_(in_fd)
    , out_fd_(out_fd)
{}

PipeClient::~PipeClient()
{
    close_internal();
}

bool PipeClient::connect()
{
    if (in_fd_ < 0 || out_fd_ < 0 || fcntl(in_fd_, F_GETFD) < 0 || fcntl(out_fd_, F_GETFD) < 0) {
        errno = EBADF;
        return false;
    }
    return true;
}

int PipeClient::wait_fd(int fd, short events, uint64_t timeout_ns)
{
    // timeout_ns == 0 means "no timeout" (infinite), matching the socket
    // client's SO_RCVTIMEO/SO_SNDTIMEO convention.
    int timeout_ms = -1;
    if (timeout_ns > 0) {
        uint64_t ms = std::max<uint64_t>(1, timeout_ns / 1000000ULL);
        timeout_ms = static_cast<int>(std::min<uint64_t>(ms, INT_MAX));
    }
    struct pollfd pfd = { .fd = fd, .events = events, .revents = 0 };
    while (true) {
        int n = ::poll(&pfd, 1, timeout_ms);
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            return -1;
        }
        if (n == 0) {
            errno = EAGAIN;
            return 0;
        }
        return 1;
    }
}

int PipeClient::read_exact(void* buf, size_t len, uint64_t timeout_ns, bool& partial)
{
    size_t total_read = 0;
    while (total_read < len) {
        // The timeout applies per poll round; a frame mid-delivery keeps making
        // progress, so this bounds "no bytes at all", the case that matters.
        int ready = wait_fd(in_fd_, POLLIN, timeout_ns);
        if (ready <= 0) {
            partial = total_read > 0;
            return -1;
        }
        ssize_t n = ::read(in_fd_, static_cast<uint8_t*>(buf) + total_read, len - total_read);
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            partial = total_read > 0;
            return -1;
        }
        if (n == 0) {
            partial = total_read > 0;
            return 0; // Server closed the pipe
        }
        total_read += static_cast<size_t>(n);
    }
    return 1;
}

int PipeClient::write_exact(const void* buf, size_t len, uint64_t timeout_ns, bool& partial)
{
    size_t total_sent = 0;
    while (total_sent < len) {
        if (timeout_ns > 0) {
            int ready = wait_fd(out_fd_, POLLOUT, timeout_ns);
            if (ready <= 0) {
                partial = total_sent > 0;
                return -1;
            }
        }
        ssize_t n = ::write(out_fd_, static_cast<const uint8_t*>(buf) + total_sent, len - total_sent);
        if (n < 0) {
            if (errno == EINTR) {
                continue;
            }
            partial = total_sent > 0;
            return -1;
        }
        total_sent += static_cast<size_t>(n);
    }
    return 1;
}

bool PipeClient::send(uint64_t request_id, const void* data, size_t len, uint64_t timeout_ns)
{
    if (out_fd_ < 0) {
        errno = EINVAL;
        return false;
    }
    if (len > MAX_FRAME_SIZE) {
        errno = EMSGSIZE;
        return false;
    }

    // Write length prefix (4 bytes, little-endian), request id (8 bytes,
    // little-endian), then message data, looping on partial writes.
    auto msg_len = static_cast<uint32_t>(FRAME_ID_SIZE + len);
    bool partial = false;
    if (write_exact(&msg_len, sizeof(msg_len), timeout_ns, partial) != 1 ||
        write_exact(&request_id, FRAME_ID_SIZE, timeout_ns, partial) != 1 ||
        write_exact(data, len, timeout_ns, partial) != 1) {
        if (partial) {
            // Part of the frame is on the wire — the stream is desynced and
            // unusable. Close rather than silently corrupting later frames.
            close_internal();
        }
        return false;
    }
    return true;
}

std::span<const uint8_t> PipeClient::receive(uint64_t timeout_ns, uint64_t& request_id)
{
    if (in_fd_ < 0) {
        return {};
    }

    // Read length prefix (4 bytes)
    uint32_t msg_len = 0;
    bool partial = false;
    if (read_exact(&msg_len, sizeof(msg_len), timeout_ns, partial) != 1) {
        if (partial) {
            // Mid-frame failure — stream desynced.
            close_internal();
        }
        return {};
    }

    // A corrupt/malicious prefix must not drive the allocation below. A frame
    // shorter than the request-id field means the peer speaks the id-less
    // protocol — close rather than misparse.
    if (msg_len > MAX_FRAME_SIZE || msg_len < FRAME_ID_SIZE) {
        close_internal();
        return {};
    }

    // Read the echoed request id (8 bytes, little-endian).
    request_id = 0;
    if (read_exact(&request_id, FRAME_ID_SIZE, timeout_ns, partial) != 1) {
        close_internal();
        return {};
    }
    msg_len -= static_cast<uint32_t>(FRAME_ID_SIZE);

    // Ensure buffer is large enough. Keep at least one byte so data() is
    // non-null for zero-length messages (null data() signals failure).
    if (recv_buffer_.size() < msg_len || recv_buffer_.empty()) {
        recv_buffer_.resize(std::max<size_t>(msg_len, 1));
    }

    if (read_exact(recv_buffer_.data(), msg_len, timeout_ns, partial) != 1) {
        // Prefix consumed but payload incomplete — stream desynced.
        close_internal();
        return {};
    }

    return std::span<const uint8_t>(recv_buffer_.data(), msg_len);
}

void PipeClient::release(size_t /*message_size*/)
{
    // No-op for pipes — data is already consumed from the kernel buffer during
    // receive().
}

void PipeClient::close()
{
    close_internal();
}

void PipeClient::close_internal()
{
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
}

} // namespace ipc
