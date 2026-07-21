#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/mpsc_shm_client.hpp"
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

std::unique_ptr<IpcClient> IpcClient::create_shm(const std::string& base_name)
{
    return std::make_unique<ShmClient>(base_name);
}

std::unique_ptr<IpcClient> IpcClient::create_mpsc_shm(const std::string& base_name, size_t client_id)
{
    return std::make_unique<MpscShmClient>(base_name, client_id);
}

} // namespace bb::ipc
