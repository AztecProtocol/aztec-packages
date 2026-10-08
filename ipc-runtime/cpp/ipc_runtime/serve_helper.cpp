#include "ipc_runtime/serve_helper.hpp"

#include <cerrno>
#include <cstdio>
#include <fcntl.h>
#include <stdexcept>
#include <string>
#include <system_error>
#include <unistd.h>

namespace ipc {

namespace {

bool ends_with(const std::string& s, const std::string& suffix)
{
    return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

} // namespace

std::unique_ptr<IpcServer> make_server(const std::string& input_path, const ServerOptions& opts)
{
    // "-" is the conventional CLI spelling for stdio: serve the process's own
    // stdin/stdout (a parent spawned us with piped stdio, PipeBackend-style).
    if (input_path == "-") {
        // stdout becomes the frame stream, so anything else the process writes
        // there (std::cout, printf, a library's diagnostics) would corrupt it.
        // Serve on a private duplicate and point fd 1 at stderr instead.
        std::fflush(stdout);
        int frame_out = ::fcntl(STDOUT_FILENO, F_DUPFD_CLOEXEC, STDERR_FILENO + 1);
        if (frame_out < 0 || ::dup2(STDERR_FILENO, STDOUT_FILENO) < 0) {
            int err = errno;
            if (frame_out >= 0) {
                ::close(frame_out);
            }
            throw std::system_error(err, std::generic_category(), "make_server: cannot take stdout for the pipe");
        }
        return IpcServer::create_pipe(STDIN_FILENO, frame_out);
    }
    if (ends_with(input_path, ".sock")) {
        return IpcServer::create_socket(input_path, opts.socket_backlog);
    }
    if (ends_with(input_path, ".shm")) {
        // SHM mode uses the base name (suffix stripped) as the shared-memory key.
        std::string base_name = input_path.substr(0, input_path.size() - 4);
        return IpcServer::create_mpsc_shm(
            base_name, opts.max_shm_clients, opts.shm_request_ring_size, opts.shm_response_ring_size);
    }
    return nullptr;
}

std::unique_ptr<IpcClient> make_client(const std::string& input_path, std::size_t shm_client_id)
{
    if (ends_with(input_path, ".sock")) {
        return IpcClient::create_socket(input_path);
    }
    if (ends_with(input_path, ".shm")) {
        std::string base_name = input_path.substr(0, input_path.size() - 4);
        return IpcClient::create_mpsc_shm(base_name, shm_client_id);
    }
    return nullptr;
}

} // namespace ipc
