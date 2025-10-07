#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/socket/uds_client.h"
#include <string>

namespace bb::ipc {

/**
 * @brief IPC client implementation using Unix domain sockets
 */
class SocketClient : public IpcClient {
  public:
    explicit SocketClient(std::string socket_path)
        : socket_path_(std::move(socket_path))
    {}

    ~SocketClient() override { close(); }

    bool connect() override
    {
        if (client_) {
            return true; // Already connected
        }

        client_ = uds_client_connect(socket_path_.c_str());
        return client_ != nullptr;
    }

    bool send(const void* data, size_t len, uint64_t /*timeout_ns*/) override
    {
        if (!client_) {
            return false;
        }

        ssize_t sent = uds_client_send(client_, data, len);
        return sent > 0;
    }

    ssize_t recv(void* buffer, size_t max_len, uint64_t /*timeout_ns*/) override
    {
        if (!client_) {
            return -1;
        }

        return uds_client_recv(client_, buffer, max_len);
    }

    void close() override
    {
        if (client_) {
            uds_client_close(client_);
            client_ = nullptr;
        }
    }

  private:
    std::string socket_path_;
    struct uds_client* client_ = nullptr;
};

} // namespace bb::ipc
