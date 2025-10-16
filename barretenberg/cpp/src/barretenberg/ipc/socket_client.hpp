#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include <cstddef>
#include <cstdint>
#include <string>
#include <sys/types.h>

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
    ssize_t recv(void* buffer, size_t max_len, uint64_t timeout_ns) override;
    void close() override;

  private:
    void close_internal();

    std::string socket_path_;
    int fd_ = -1;
};

} // namespace bb::ipc
