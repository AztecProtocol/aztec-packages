#pragma once

#include "ipc_runtime/ipc_server.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>

namespace ipc {

/**
 * @brief IPC server over an already-open file-descriptor pair (e.g. stdin/stdout).
 *
 * A single implicit client (id 0) that is connected from listen() onward: the fd
 * pair IS the connection, so there is no accept step. Framing is identical to the
 * socket transport ([4B LE length][8B LE request id][payload]) — a process holding
 * the other end of the pipes is a peer exactly like a UDS client, served by the
 * same run()/run_reactor() code.
 *
 * Peer EOF on the read fd requests shutdown: a pipe server's lifetime is its
 * pipe (the spawning parent closing stdin is how it tells the child to exit).
 *
 * Writes rely on SIGPIPE being ignored so a closed peer yields EPIPE instead of
 * killing the process — install_default_signal_handlers() does this; standalone
 * users (tests) must ignore SIGPIPE themselves.
 */
class PipeServer : public IpcServer {
  public:
    // Takes ownership of the fds; close() closes them (once, if they are equal —
    // a socketpair end can serve as both).
    PipeServer(int in_fd, int out_fd);
    ~PipeServer() override;

    PipeServer(const PipeServer&) = delete;
    PipeServer& operator=(const PipeServer&) = delete;
    PipeServer(PipeServer&&) = delete;
    PipeServer& operator=(PipeServer&&) = delete;

    bool listen() override;
    int wait_for_data(uint64_t timeout_ns) override;
    std::span<const uint8_t> receive(int client_id, uint64_t& request_id) override;
    void release(int client_id, size_t message_size) override;
    bool send(int client_id, uint64_t request_id, const void* data, size_t len) override;
    void close() override;

    // Wake a thread blocked in wait_for_data() by writing the self-pipe that
    // sits in the same poll set as the input fd. Used by run_reactor() to
    // surface a worker-thread completion promptly.
    void notify() override;

  private:
    void close_internal();
    void disconnect();
    bool setup_wake_pipe();
    void drain_wake_pipe();

    int in_fd_;
    int out_fd_;
    int wake_read_fd_ = -1;  // self-pipe read end (in the poll set)
    int wake_write_fd_ = -1; // self-pipe write end (poked by notify())
    bool connected_ = false;
    std::vector<uint8_t> recv_buffer_;
};

} // namespace ipc
