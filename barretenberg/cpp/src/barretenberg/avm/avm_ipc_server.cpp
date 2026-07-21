#include "barretenberg/avm/avm_ipc_server.hpp"
#include "barretenberg/avm/avm_execute.hpp"
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"

#include <chrono>
#include <csignal>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace bb::avm {

int execute_avm_server(const std::string& input_path, const std::string& wsdb_path, const std::string& cdb_path)
{
    info("Connecting to aztec-wsdb at ", wsdb_path);
    constexpr int max_retries = 50;
    constexpr int retry_delay_ms = 100;
    std::unique_ptr<wsdb::WsdbIpcClient> wsdb_client;
    for (int attempt = 0; attempt < max_retries; ++attempt) {
        try {
            wsdb_client = std::make_unique<wsdb::WsdbIpcClient>(wsdb_path);
            break;
        } catch (const std::exception& e) {
            if (attempt == max_retries - 1) {
                info("Failed to connect to aztec-wsdb after ", max_retries, " attempts: ", e.what());
                return 1;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(retry_delay_ms));
        }
    }

    info("Connecting to CDB at ", cdb_path);
    std::unique_ptr<cdb::CdbIpcContractDB> cdb_client;
    for (int attempt = 0; attempt < max_retries; ++attempt) {
        try {
            cdb_client = std::make_unique<cdb::CdbIpcContractDB>(cdb_path);
            break;
        } catch (const std::exception& e) {
            if (attempt == max_retries - 1) {
                info("Failed to connect to CDB after ", max_retries, " attempts: ", e.what());
                return 1;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(retry_delay_ms));
        }
    }

    AvmRequest request{ .cdb_client = *cdb_client, .wsdb_client = *wsdb_client };

    ipc::ServerOptions opts;
    opts.max_shm_clients = 1;
    auto server = ipc::make_server(input_path, opts);
    if (!server) {
        info("Error: --input path must end with .sock or .shm: ", input_path);
        return 1;
    }

    info("bb-avm-sim listening on ", input_path);
    ipc::install_default_signal_handlers(*server);
    auto cancel_simulation_handler = [](int /*signal*/) {
        auto* token = g_active_cancellation_token.load(std::memory_order_acquire);
        if (token) {
            token->cancel();
        }
    };

    (void)std::signal(SIGUSR1, cancel_simulation_handler);

    if (!server->listen()) {
        info("Error: Could not start IPC server");
        return 1;
    }

    info("bb-avm-sim IPC server ready");

    // A single AVM simulation runs synchronously per connection (the simulator
    // pool gives each bb-avm-sim process one connection, one in-flight request),
    // so the handler runs inline on the reactor thread and responds before the
    // reactor loops — no dispatch pool needed.
    auto handler = make_avm_handler(request);
    server->run_reactor([&handler](int /*client_id*/, std::span<const uint8_t> raw, ipc::IpcServer::Respond respond) {
        handler(raw, std::move(respond));
    });

    server->close();
    return 0;
}

} // namespace bb::avm
