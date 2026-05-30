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
#include <iostream>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace bb::avm {

int execute_avm_server(const std::string& input_path, const std::string& wsdb_path, const std::string& cdb_path)
{
    // Connect to WSDB server with retry
    std::cerr << "Connecting to aztec-wsdb at " << wsdb_path << '\n';
    constexpr int max_retries = 50;
    constexpr int retry_delay_ms = 100;
    std::unique_ptr<wsdb::WsdbIpcClient> wsdb_client;
    for (int attempt = 0; attempt < max_retries; ++attempt) {
        try {
            wsdb_client = std::make_unique<wsdb::WsdbIpcClient>(wsdb_path);
            break;
        } catch (const std::exception& e) {
            if (attempt == max_retries - 1) {
                std::cerr << "Failed to connect to aztec-wsdb after " << max_retries << " attempts: " << e.what()
                          << '\n';
                return 1;
            }
            std::this_thread::sleep_for(std::chrono::milliseconds(retry_delay_ms));
        }
    }

    // Connect to CDB server with retry (TS server may still be binding its socket)
    std::cerr << "Connecting to aztec-cdb at " << cdb_path << '\n';
    std::unique_ptr<cdb::CdbIpcContractDB> cdb_client;
    for (int attempt = 0; attempt < max_retries; ++attempt) {
        try {
            cdb_client = std::make_unique<cdb::CdbIpcContractDB>(cdb_path);
            break;
        } catch (const std::exception& e) {
            if (attempt == max_retries - 1) {
                std::cerr << "Failed to connect to aztec-cdb after " << max_retries << " attempts: " << e.what()
                          << '\n';
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
        std::cerr << "Error: --input path must end with .sock or .shm: " << input_path << '\n';
        return 1;
    }

    std::cerr << "aztec-avm listening on " << input_path << '\n';
    ipc::install_default_signal_handlers(*server);
    auto cancel_simulation_handler = [](int /*signal*/) {
        auto* token = g_active_cancellation_token.load(std::memory_order_acquire);
        if (token) {
            token->cancel();
        }
    };

    (void)std::signal(SIGUSR1, cancel_simulation_handler);

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }

    std::cerr << "aztec-avm IPC server ready" << '\n';

    auto handler = make_avm_handler(request);
    server->run([&handler](int /*client_id*/, std::span<const uint8_t> raw_request) -> std::vector<uint8_t> {
        return handler(std::vector<uint8_t>(raw_request.begin(), raw_request.end()));
    });

    server->close();
    return 0;
}

} // namespace bb::avm
