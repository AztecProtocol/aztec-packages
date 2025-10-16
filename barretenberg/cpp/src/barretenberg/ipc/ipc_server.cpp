#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/shm_server.hpp"
#include "barretenberg/ipc/socket_server.hpp"
#include <cstddef>
#include <memory>
#include <string>

namespace bb::ipc {

std::unique_ptr<IpcServer> IpcServer::create_socket(const std::string& socket_path, int max_clients)
{
    return std::make_unique<SocketServer>(socket_path, max_clients);
}

std::unique_ptr<IpcServer> IpcServer::create_shm(const std::string& base_name, size_t max_clients)
{
    return std::make_unique<ShmServer>(base_name, max_clients);
}

} // namespace bb::ipc
