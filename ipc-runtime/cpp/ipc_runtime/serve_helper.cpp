#include "ipc_runtime/serve_helper.hpp"

#include <stdexcept>
#include <string>

namespace ipc {

namespace {

bool ends_with(const std::string& s, const std::string& suffix)
{
    return s.size() >= suffix.size() && s.compare(s.size() - suffix.size(), suffix.size(), suffix) == 0;
}

} // namespace

std::unique_ptr<IpcServer> make_server(const std::string& input_path, const ServerOptions& opts)
{
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
