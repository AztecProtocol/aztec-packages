#pragma once

#include "ipc_runtime/ipc_client.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>

namespace ipc {

/**
 * @brief IPC client over an already-open file-descriptor pair.
 *
 * The counterpart of PipeServer, with the same [4B LE length][8B LE request
 * id][payload] framing as the socket transport. The typical producer of the fd
 * pair is a parent that spawned the server with its stdin/stdout piped (the
 * barretenberg-rs PipeBackend pattern); in-process tests use pipe/socketpair
 * fd pairs.
 *
 * The receive timeout is honoured via poll(); writes block until the frame is
 * fully on the pipe (poll(POLLOUT)-gated when a timeout is given). Writes rely
 * on SIGPIPE being ignored so a closed peer yields EPIPE (see PipeServer).
 */
class PipeClient : public IpcClient {
  public:
    // Takes ownership of the fds; close() closes them (once, if they are equal).
    PipeClient(int in_fd, int out_fd);
    ~PipeClient() override;

    PipeClient(const PipeClient&) = delete;
    PipeClient& operator=(const PipeClient&) = delete;
    PipeClient(PipeClient&&) = delete;
    PipeClient& operator=(PipeClient&&) = delete;

    bool connect() override;
    bool send(uint64_t request_id, const void* data, size_t len, uint64_t timeout_ns) override;
    using IpcClient::send; // serial auto-id convenience overload
    std::span<const uint8_t> receive(uint64_t timeout_ns, uint64_t& request_id) override;
    using IpcClient::receive; // serial echo-verifying convenience overload
    void release(size_t message_size) override;
    void close() override;

  private:
    void close_internal();
    // Returns 1 on success, 0 on peer EOF, -1 on error/timeout. `partial` is set
    // when some but not all bytes moved (stream desync).
    int read_exact(void* buf, size_t len, uint64_t timeout_ns, bool& partial);
    int write_exact(const void* buf, size_t len, uint64_t timeout_ns, bool& partial);
    // Wait for the fd to become ready; 1 ready, 0 timeout, -1 error.
    static int wait_fd(int fd, short events, uint64_t timeout_ns);

    int in_fd_;
    int out_fd_;
    std::vector<uint8_t> recv_buffer_;
};

} // namespace ipc
