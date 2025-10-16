#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/shm_client.hpp"
#include "barretenberg/ipc/socket_client.hpp"
#include <cstddef>
#include <memory>
#include <string>

namespace bb::ipc {

std::unique_ptr<IpcClient> IpcClient::create_socket(const std::string& socket_path)
{
    return std::make_unique<SocketClient>(socket_path);
}

std::unique_ptr<IpcClient> IpcClient::create_shm(const std::string& base_name, size_t max_clients)
{
    return std::make_unique<ShmClient>(base_name, max_clients);
}

} // namespace bb::ipc
