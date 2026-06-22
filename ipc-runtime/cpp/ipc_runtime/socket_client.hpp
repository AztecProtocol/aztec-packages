#pragma once

#include "ipc_runtime/ipc_client.hpp"
#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <sys/types.h>
#include <vector>

namespace ipc {

/**
 * @brief IPC client implementation using Unix domain sockets
 *
 * Direct implementation with no wrapper layer - manages socket connection
 * directly. Send/receive timeouts are honored via SO_SNDTIMEO / SO_RCVTIMEO
 * (timeout_ns == 0 means infinite).
 */
class SocketClient : public IpcClient {
  public:
    explicit SocketClient(std::string socket_path);
    ~SocketClient() override;

    // Non-copyable, non-movable (owns file descriptor)
    SocketClient(const SocketClient&) = delete;
    SocketClient& operator=(const SocketClient&) = delete;
    SocketClient(SocketClient&&) = delete;
    SocketClient& operator=(SocketClient&&) = delete;

    bool connect() override;
    bool send(const void* data, size_t len, uint64_t timeout_ns) override;
    std::span<const uint8_t> receive(uint64_t timeout_ns) override;
    void release(size_t message_size) override;
    void close() override;

  private:
    void close_internal();
    bool apply_timeout(int option, uint64_t& applied_ns, uint64_t timeout_ns);
    // Returns 1 on success, 0 on orderly EOF before any byte, -1 on
    // error/timeout. `partial` is set when the stream is desynced (some but
    // not all bytes transferred).
    int recv_exact(void* buf, size_t len, bool& partial);
    int send_exact(const void* buf, size_t len, bool& partial);

    std::string socket_path_;
    int fd_ = -1;
    std::vector<uint8_t> recv_buffer_; // Internal buffer for socket recv
    // Last timeouts applied via setsockopt; avoids a syscall per call.
    uint64_t applied_recv_timeout_ns_ = 0;
    uint64_t applied_send_timeout_ns_ = 0;
};

} // namespace ipc
