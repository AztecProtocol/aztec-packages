#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/mpsc_shm_server.hpp"
#include "ipc_runtime/pipe_server.hpp"
#include "ipc_runtime/shm_server.hpp"
#include "ipc_runtime/socket_server.hpp"
#include <cstddef>
#include <memory>
#include <string>

namespace ipc {

std::unique_ptr<IpcServer> IpcServer::create_socket(const std::string& socket_path, int max_clients)
{
    return std::make_unique<SocketServer>(socket_path, max_clients);
}

std::unique_ptr<IpcServer> IpcServer::create_shm(const std::string& base_name,
                                                 size_t request_ring_size,
                                                 size_t response_ring_size)
{
    return std::make_unique<ShmServer>(base_name, request_ring_size, response_ring_size);
}

std::unique_ptr<IpcServer> IpcServer::create_mpsc_shm(const std::string& base_name,
                                                      size_t max_clients,
                                                      size_t request_ring_size,
                                                      size_t response_ring_size)
{
    return std::make_unique<MpscShmServer>(base_name, max_clients, request_ring_size, response_ring_size);
}

std::unique_ptr<IpcServer> IpcServer::create_pipe(int in_fd, int out_fd)
{
    return std::make_unique<PipeServer>(in_fd, out_fd);
}

} // namespace ipc
