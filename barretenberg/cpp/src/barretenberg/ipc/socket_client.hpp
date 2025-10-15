#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include <string>

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

    bool connect() override;
    bool send(const void* data, size_t len, uint64_t timeout_ns = 0) override;
    ssize_t recv(void* buffer, size_t max_len, uint64_t timeout_ns = 0) override;
    void close() override;

  private:
    std::string socket_path_;
    int fd_ = -1;
};

} // namespace bb::ipc
