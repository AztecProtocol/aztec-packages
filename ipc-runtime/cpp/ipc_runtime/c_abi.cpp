#include "ipc_runtime/c_abi.h"

#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"

#include <cstring>
#include <exception>
#include <memory>
#include <string>
#include <utility>
#include <vector>

// Opaque structs that wrap the C++ unique_ptrs. Keeping them as distinct types
// (rather than typedefs to the C++ classes) means the C ABI is a true name-only
// surface — no C++ types leak into the header.

struct ipc_server {
    std::unique_ptr<ipc::IpcServer> impl;
};

struct ipc_client {
    std::unique_ptr<ipc::IpcClient> impl;
};

namespace {

inline ipc_server* wrap_server(std::unique_ptr<ipc::IpcServer> s)
{
    if (!s) {
        return nullptr;
    }
    auto* w = new ipc_server;
    w->impl = std::move(s);
    return w;
}

inline ipc_client* wrap_client(std::unique_ptr<ipc::IpcClient> c)
{
    if (!c) {
        return nullptr;
    }
    auto* w = new ipc_client;
    w->impl = std::move(c);
    return w;
}

} // namespace

extern "C" {

// -------- Options ----------------------------------------------------------

void ipc_server_options_default(ipc_server_options_t* opts)
{
    if (!opts) {
        return;
    }
    ipc::ServerOptions defaults;
    opts->max_shm_clients = defaults.max_shm_clients;
    opts->shm_request_ring_size = defaults.shm_request_ring_size;
    opts->shm_response_ring_size = defaults.shm_response_ring_size;
    opts->socket_backlog = defaults.socket_backlog;
}

// -------- Server -----------------------------------------------------------

ipc_server_t* ipc_make_server(const char* path, const ipc_server_options_t* opts)
{
    if (!path) {
        return nullptr;
    }
    ipc::ServerOptions cpp_opts;
    if (opts) {
        cpp_opts.max_shm_clients = opts->max_shm_clients;
        cpp_opts.shm_request_ring_size = opts->shm_request_ring_size;
        cpp_opts.shm_response_ring_size = opts->shm_response_ring_size;
        cpp_opts.socket_backlog = opts->socket_backlog;
    }
    return wrap_server(ipc::make_server(path, cpp_opts));
}

ipc_server_t* ipc_server_create_socket(const char* path, int max_clients)
{
    if (!path) {
        return nullptr;
    }
    return wrap_server(ipc::IpcServer::create_socket(path, max_clients));
}

ipc_server_t* ipc_server_create_mpsc_shm(const char* base_name,
                                         size_t max_clients,
                                         size_t request_ring_size,
                                         size_t response_ring_size)
{
    if (!base_name) {
        return nullptr;
    }
    return wrap_server(ipc::IpcServer::create_mpsc_shm(base_name, max_clients, request_ring_size, response_ring_size));
}

void ipc_server_destroy(ipc_server_t* server)
{
    delete server;
}

bool ipc_server_listen(ipc_server_t* server)
{
    return server && server->impl ? server->impl->listen() : false;
}

void ipc_server_close(ipc_server_t* server)
{
    if (server && server->impl) {
        server->impl->close();
    }
}

void ipc_server_request_shutdown(ipc_server_t* server)
{
    if (server && server->impl) {
        server->impl->request_shutdown();
    }
}

int ipc_server_wait_for_data(ipc_server_t* server, uint64_t timeout_ns)
{
    return server && server->impl ? server->impl->wait_for_data(timeout_ns) : -1;
}

ipc_status_t ipc_server_receive(
    ipc_server_t* server, int client_id, uint64_t* request_id_out, const uint8_t** out, size_t* out_len)
{
    if (!server || !server->impl || !request_id_out || !out || !out_len) {
        return IPC_ERR_RECV;
    }
    uint64_t request_id = 0;
    auto view = server->impl->receive(client_id, request_id);
    // data() == nullptr is error/timeout; a non-null empty view is a valid
    // zero-length message.
    if (view.data() == nullptr) {
        *out = nullptr;
        *out_len = 0;
        return IPC_ERR_RECV;
    }
    *request_id_out = request_id;
    *out = view.data();
    *out_len = view.size();
    return IPC_OK;
}

void ipc_server_release(ipc_server_t* server, int client_id, size_t msg_size)
{
    if (server && server->impl) {
        server->impl->release(client_id, msg_size);
    }
}

bool ipc_server_send(ipc_server_t* server, int client_id, uint64_t request_id, const uint8_t* data, size_t len)
{
    return server && server->impl ? server->impl->send(client_id, request_id, data, len) : false;
}

void ipc_server_run(ipc_server_t* server, ipc_server_handler_fn handler, void* ctx)
{
    if (!server || !server->impl || !handler) {
        return;
    }
    server->impl->run([handler, ctx](int client_id, std::span<const uint8_t> raw) -> std::vector<uint8_t> {
        uint8_t* resp_ptr = nullptr;
        size_t resp_len = 0;
        handler(client_id, raw.data(), raw.size(), &resp_ptr, &resp_len, ctx);
        if (!resp_ptr || resp_len == 0) {
            return {};
        }
        return std::vector<uint8_t>(resp_ptr, resp_ptr + resp_len);
    });
}

void ipc_install_default_signal_handlers(ipc_server_t* server)
{
    if (server && server->impl) {
        ipc::install_default_signal_handlers(*server->impl);
    }
}

// -------- Client -----------------------------------------------------------

ipc_client_t* ipc_make_client(const char* path, size_t shm_client_id)
{
    if (!path) {
        return nullptr;
    }
    return wrap_client(ipc::make_client(path, shm_client_id));
}

ipc_client_t* ipc_client_create_socket(const char* socket_path)
{
    if (!socket_path) {
        return nullptr;
    }
    return wrap_client(ipc::IpcClient::create_socket(socket_path));
}

ipc_client_t* ipc_client_create_mpsc_shm(const char* base_name, size_t client_id)
{
    if (!base_name) {
        return nullptr;
    }
    return wrap_client(ipc::IpcClient::create_mpsc_shm(base_name, client_id));
}

void ipc_client_destroy(ipc_client_t* client)
{
    delete client;
}

bool ipc_client_connect(ipc_client_t* client)
{
    return client && client->impl ? client->impl->connect() : false;
}

void ipc_client_close(ipc_client_t* client)
{
    if (client && client->impl) {
        client->impl->close();
    }
}

bool ipc_client_send(ipc_client_t* client, const uint8_t* data, size_t len, uint64_t timeout_ns)
{
    return client && client->impl ? client->impl->send(data, len, timeout_ns) : false;
}

ipc_status_t ipc_client_receive(ipc_client_t* client, uint64_t timeout_ns, const uint8_t** out, size_t* out_len)
{
    if (!client || !client->impl || !out || !out_len) {
        return IPC_ERR_RECV;
    }
    auto view = client->impl->receive(timeout_ns);
    // data() == nullptr is error/timeout; a non-null empty view is a valid
    // zero-length response (IPC_OK with *out_len == 0).
    if (view.data() == nullptr) {
        *out = nullptr;
        *out_len = 0;
        return IPC_ERR_RECV;
    }
    *out = view.data();
    *out_len = view.size();
    return IPC_OK;
}

void ipc_client_release(ipc_client_t* client, size_t msg_size)
{
    if (client && client->impl) {
        client->impl->release(msg_size);
    }
}

} // extern "C"
