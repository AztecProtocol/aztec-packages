#pragma once

#include "barretenberg/ipc/ipc_server.hpp"
#include <cstddef>
#include <cstdint>
#include <string>
#include <sys/types.h>
#include <unordered_map>
#include <vector>

namespace bb::ipc {

/**
 * @brief IPC server implementation using Unix domain sockets
 *
 * Platform-specific implementation:
 * - Linux: uses epoll for efficient multi-client handling
 * - macOS: uses kqueue for efficient multi-client handling
 * Dynamic client capacity with no artificial limits.
 */
class SocketServer : public IpcServer {
  public:
    SocketServer(std::string socket_path, int initial_max_clients);
    ~SocketServer() override;

    // Non-copyable, non-movable (owns file descriptors)
    SocketServer(const SocketServer&) = delete;
    SocketServer& operator=(const SocketServer&) = delete;
    SocketServer(SocketServer&&) = delete;
    SocketServer& operator=(SocketServer&&) = delete;

    bool listen() override;
    int accept() override;
    int wait_for_data(uint64_t timeout_ns) override;
    std::span<const uint8_t> receive(int client_id) override;
    void release(int client_id, size_t message_size) override;
    bool send(int client_id, const void* data, size_t len) override;
    void close() override;

  private:
    void close_internal();
    void disconnect_client(int client_id);
    int find_free_slot();

    std::string socket_path_;
    int initial_max_clients_;
    int listen_fd_ = -1;
    int fd_ = -1;                                    // kqueue or epoll fd
    std::vector<int> client_fds_;                    // client_id -> fd
    std::unordered_map<int, int> fd_to_client_id_;   // fd -> client_id (for fast lookup)
    std::vector<std::vector<uint8_t>> recv_buffers_; // client_id -> recv buffer
    int num_clients_ = 0;
};

} // namespace bb::ipc
