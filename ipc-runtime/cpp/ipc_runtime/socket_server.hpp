#pragma once

#include "ipc_runtime/ipc_server.hpp"
#include <cstddef>
#include <cstdint>
#include <string>
#include <sys/types.h>
#include <unordered_map>
#include <utility>
#include <vector>

namespace ipc {

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
    std::span<const uint8_t> receive(int client_id, uint64_t& request_id) override;
    void release(int client_id, size_t message_size) override;
    bool send(int client_id, uint64_t request_id, const void* data, size_t len) override;
    void close() override;

    // Wake a thread blocked in wait_for_data() by writing the self-pipe whose
    // read end sits in the epoll/kqueue set. Used by run_reactor() to surface a
    // worker-thread completion promptly.
    void notify() override;

    CleanupPaths cleanup_paths() const override
    {
        return CleanupPaths{ .unlink_paths = { socket_path_ }, .shm_unlink_names = {} };
    }

  private:
    void close_internal();
    void disconnect_client(int client_id);
    // Create the self-pipe and register its read end with the epoll/kqueue
    // instance. Returns false on failure. Called from listen().
    bool setup_wake_pipe();
    // Drain everything pending on the self-pipe read end (level-triggered).
    void drain_wake_pipe();

    std::string socket_path_;
    int initial_max_clients_;
    int listen_fd_ = -1;
    int fd_ = -1;            // kqueue or epoll fd
    int wake_read_fd_ = -1;  // self-pipe read end (in the event set)
    int wake_write_fd_ = -1; // self-pipe write end (poked by notify())
    // Client ids are monotonic and never reused: a connection's identity must not be
    // inheritable by a later connection, or state addressed to a dead client (a late
    // handler response, reorder bookkeeping) could reach its successor. Contrast with
    // the SHM transport, whose ids are physical ring indices and must recycle.
    int next_client_id_ = 0;
    std::unordered_map<int, int> client_fds_;                    // client_id -> fd
    std::unordered_map<int, int> fd_to_client_id_;               // fd -> client_id (for fast lookup)
    std::unordered_map<int, std::vector<uint8_t>> recv_buffers_; // client_id -> recv buffer
    int num_clients_ = 0;
};

} // namespace ipc
