#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <sys/types.h>
#include <vector>

namespace bb::ipc {

/**
 * @brief IPC client implementation using Unix domain sockets
 *
 * Direct implementation with no wrapper layer - manages socket connection directly.
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
    std::span<const uint8_t> recv(uint64_t timeout_ns) override;
    void release(size_t message_size) override;
    void close() override;

  private:
    void close_internal();

    std::string socket_path_;
    int fd_ = -1;
    std::vector<uint8_t> recv_buffer_; // Internal buffer for socket recv
};

} // namespace bb::ipc
