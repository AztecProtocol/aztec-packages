#pragma once

#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/socket/uds_server.h"
#include <string>
#include <unistd.h>

namespace bb::ipc {

/**
 * @brief IPC server implementation using Unix domain sockets
 */
class SocketServer : public IpcServer {
  public:
    SocketServer(std::string socket_path, int max_clients)
        : socket_path_(std::move(socket_path))
        , max_clients_(max_clients)
    {}

    ~SocketServer() override { close(); }

    bool listen() override
    {
        if (server_) {
            return true; // Already listening
        }

        // Clean up any leftover socket file
        unlink(socket_path_.c_str());

        server_ = uds_server_create(socket_path_.c_str(), max_clients_);
        return server_ != nullptr;
    }

    int wait_for_data(uint64_t timeout_ns) override
    {
        if (!server_) {
            return -1;
        }

        // Convert nanoseconds to microseconds
        int timeout_us = timeout_ns > 0 ? static_cast<int>(timeout_ns / 1000) : -1;
        return uds_server_wait_for_data(server_, timeout_us);
    }

    ssize_t recv(int client_id, void* buffer, size_t max_len) override
    {
        if (!server_) {
            return -1;
        }

        return uds_server_recv(server_, client_id, buffer, max_len);
    }

    bool send(int client_id, const void* data, size_t len) override
    {
        if (!server_) {
            return false;
        }

        ssize_t sent = uds_server_send(server_, client_id, data, len);
        return sent > 0;
    }

    void close() override
    {
        if (server_) {
            uds_server_close(server_);
            server_ = nullptr;
        }

        // Clean up socket file
        unlink(socket_path_.c_str());
    }

  private:
    std::string socket_path_;
    int max_clients_;
    struct uds_server* server_ = nullptr;
};

} // namespace bb::ipc
