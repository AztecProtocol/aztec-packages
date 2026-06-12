#include "ipc_runtime/socket_client.hpp"
#include "ipc_runtime/constants.hpp"
#include <algorithm>
#include <cerrno>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <string>
#include <sys/socket.h>
#include <sys/time.h>
#include <sys/types.h>
#include <sys/un.h>
#include <thread>
#include <unistd.h>
#include <utility>

namespace ipc {

SocketClient::SocketClient(std::string socket_path)
    : socket_path_(std::move(socket_path)) {}

SocketClient::~SocketClient() { close_internal(); }

bool SocketClient::connect() {
  if (fd_ >= 0) {
    return true; // Already connected
  }

  constexpr size_t max_attempts =
      CONNECT_RETRY_BUDGET_MS / CONNECT_RETRY_DELAY_MS;
  constexpr auto retry_delay =
      std::chrono::milliseconds(CONNECT_RETRY_DELAY_MS);

  for (size_t attempt = 0; attempt < max_attempts; ++attempt) {
    // Create socket
    fd_ = socket(AF_UNIX, SOCK_STREAM, 0);
    if (fd_ < 0) {
      return false;
    }

    // Connect to server
    struct sockaddr_un addr;
    std::memset(&addr, 0, sizeof(addr));
    addr.sun_family = AF_UNIX;
    std::strncpy(addr.sun_path, socket_path_.c_str(),
                 sizeof(addr.sun_path) - 1);

    if (::connect(fd_, reinterpret_cast<struct sockaddr *>(&addr),
                  sizeof(addr)) == 0) {
      applied_recv_timeout_ns_ = 0;
      applied_send_timeout_ns_ = 0;
      return true;
    }

    ::close(fd_);
    fd_ = -1;
    if (attempt + 1 == max_attempts) {
      return false;
    }
    std::this_thread::sleep_for(retry_delay);
  }

  return false;
}

bool SocketClient::apply_timeout(int option, uint64_t &applied_ns,
                                 uint64_t timeout_ns) {
  if (applied_ns == timeout_ns) {
    return true;
  }
  // timeout_ns == 0 → {0, 0} which means "no timeout" (infinite) for
  // SO_RCVTIMEO / SO_SNDTIMEO.
  struct timeval tv;
  tv.tv_sec = static_cast<time_t>(timeout_ns / 1000000000ULL);
  tv.tv_usec = static_cast<suseconds_t>((timeout_ns % 1000000000ULL) / 1000ULL);
  if (setsockopt(fd_, SOL_SOCKET, option, &tv, sizeof(tv)) != 0) {
    return false;
  }
  applied_ns = timeout_ns;
  return true;
}

int SocketClient::send_exact(const void *buf, size_t len, bool &partial) {
  size_t total_sent = 0;
  while (total_sent < len) {
    ssize_t n = ::send(fd_, static_cast<const uint8_t *>(buf) + total_sent,
                       len - total_sent, 0);
    if (n < 0) {
      if (errno == EINTR) {
        continue; // Interrupted, retry
      }
      partial = total_sent > 0;
      return -1; // Timeout (EAGAIN/EWOULDBLOCK) or hard error
    }
    total_sent += static_cast<size_t>(n);
  }
  return 1;
}

int SocketClient::recv_exact(void *buf, size_t len, bool &partial) {
  size_t total_read = 0;
  while (total_read < len) {
    ssize_t n = ::recv(fd_, static_cast<uint8_t *>(buf) + total_read,
                       len - total_read, 0);
    if (n < 0) {
      if (errno == EINTR) {
        continue; // Interrupted, retry
      }
      partial = total_read > 0;
      return -1; // Timeout (EAGAIN/EWOULDBLOCK) or hard error
    }
    if (n == 0) {
      partial = total_read > 0;
      return 0; // Server disconnected
    }
    total_read += static_cast<size_t>(n);
  }
  return 1;
}

bool SocketClient::send(const void *data, size_t len, uint64_t timeout_ns) {
  if (fd_ < 0) {
    errno = EINVAL;
    return false;
  }
  if (len > MAX_FRAME_SIZE) {
    errno = EMSGSIZE;
    return false;
  }

  apply_timeout(SO_SNDTIMEO, applied_send_timeout_ns_, timeout_ns);

  // Send length prefix (4 bytes, little-endian), then message data,
  // looping on partial writes.
  auto msg_len = static_cast<uint32_t>(len);
  bool partial = false;
  if (send_exact(&msg_len, sizeof(msg_len), partial) != 1 ||
      send_exact(data, len, partial) != 1) {
    if (partial) {
      // Part of the frame is on the wire — the stream is desynced and
      // unusable. Close rather than silently corrupting later frames.
      close_internal();
    }
    return false;
  }
  return true;
}

std::span<const uint8_t> SocketClient::receive(uint64_t timeout_ns) {
  if (fd_ < 0) {
    return {};
  }

  apply_timeout(SO_RCVTIMEO, applied_recv_timeout_ns_, timeout_ns);

  // Read length prefix (4 bytes)
  uint32_t msg_len = 0;
  bool partial = false;
  if (recv_exact(&msg_len, sizeof(msg_len), partial) != 1) {
    if (partial) {
      // Mid-frame failure — stream desynced.
      close_internal();
    }
    return {};
  }

  // A corrupt/malicious prefix must not drive the allocation below.
  if (msg_len > MAX_FRAME_SIZE) {
    close_internal();
    return {};
  }

  // Ensure buffer is large enough. Keep at least one byte so data() is
  // non-null for zero-length messages (null data() signals failure).
  if (recv_buffer_.size() < msg_len || recv_buffer_.empty()) {
    recv_buffer_.resize(std::max<size_t>(msg_len, 1));
  }

  // Read message data into internal buffer
  if (recv_exact(recv_buffer_.data(), msg_len, partial) != 1) {
    // Prefix consumed but payload incomplete — stream desynced.
    close_internal();
    return {};
  }

  // Return span into internal buffer
  return std::span<const uint8_t>(recv_buffer_.data(), msg_len);
}

void SocketClient::release(size_t /*message_size*/) {
  // No-op for sockets - data is already consumed from kernel buffer during
  // recv()
}

void SocketClient::close() { close_internal(); }

void SocketClient::close_internal() {
  if (fd_ >= 0) {
    ::close(fd_);
    fd_ = -1;
  }
}

} // namespace ipc
