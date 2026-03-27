#include "barretenberg/avm/avm_ipc_server.hpp"
#include "barretenberg/avm/avm_execute.hpp"
#include "barretenberg/avm/generated/avm_ipc_server.hpp"
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/parent_monitor.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_client.hpp"

#include <atomic>
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

    // Signal handling
    static std::atomic<bool> shutdown_flag{ false };
    auto signal_handler = [](int) { shutdown_flag.store(true, std::memory_order_release); };
    std::signal(SIGTERM, signal_handler);
    std::signal(SIGINT, signal_handler);
    std::signal(SIGPIPE, SIG_IGN);

    // SIGUSR1 cancels the active simulation without killing the process.
    // TypeScript sends this signal when a tx exceeds its deadline.
    auto cancel_simulation_handler = [](int /*signal*/) {
        auto* token = g_active_cancellation_token.load(std::memory_order_acquire);
        if (token) {
            token->cancel();
        }
    };
    std::signal(SIGUSR1, cancel_simulation_handler);

    // Parent death monitoring (SIGTERM on Linux, kqueue on macOS)
    bb::monitor_parent_process(shutdown_flag);

    // Run server using generated dispatch.
    std::cerr << "aztec-avm IPC server starting on " << input_path << '\n';
    serve(input_path.c_str(), request, &shutdown_flag);
    return 0;
}

} // namespace bb::avm
