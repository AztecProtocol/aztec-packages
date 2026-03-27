#include "barretenberg/avm/avm_ipc_server.hpp"
#include "barretenberg/avm/avm_execute.hpp"
#include "barretenberg/avm/avm_ipc_server_generated.hpp"
#include "barretenberg/cdb/cdb_ipc_client.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/wsdb/wsdb_ipc_client_generated.hpp"

#include <chrono>
#include <csignal>
#include <iostream>
#include <memory>
#include <string>
#include <thread>
#include <unistd.h>
#include <vector>

#ifdef __linux__
#include <sys/prctl.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#endif

namespace bb::avm {

// ---------------------------------------------------------------------------
// Platform-specific parent death monitoring
// ---------------------------------------------------------------------------

static void setup_parent_death_monitoring()
{
#ifdef __linux__
    if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
        std::cerr << "Warning: Could not set parent death signal" << '\n';
    }
#elif defined(__APPLE__)
    pid_t parent_pid = getppid();
    std::thread([parent_pid]() {
        int kq = kqueue();
        if (kq == -1) {
            std::cerr << "Warning: Could not create kqueue for parent monitoring" << '\n';
            return;
        }
        struct kevent change;
        EV_SET(&change, parent_pid, EVFILT_PROC, EV_ADD | EV_ENABLE, NOTE_EXIT, 0, nullptr);
        if (kevent(kq, &change, 1, nullptr, 0, nullptr) == -1) {
            std::cerr << "Warning: Could not monitor parent process" << '\n';
            close(kq);
            return;
        }
        struct kevent event;
        kevent(kq, nullptr, 0, &event, 1, nullptr);
        std::cerr << "Parent process exited, shutting down..." << '\n';
        close(kq);
        std::exit(0);
    }).detach();
#endif
}

// ---------------------------------------------------------------------------
// IPC server execution
// ---------------------------------------------------------------------------

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

    // Create IPC server
    std::unique_ptr<ipc::IpcServer> server;

    if (input_path.size() >= 5 && input_path.substr(input_path.size() - 5) == ".sock") {
        server = ipc::IpcServer::create_socket(input_path, 1);
        std::cerr << "Socket server at " << input_path << '\n';
    } else {
        std::cerr << "Error: --input path must end with .sock" << '\n';
        return 1;
    }

    // Set up signal handlers
    static ipc::IpcServer* global_server = server.get();

    auto graceful_shutdown_handler = [](int signal) {
        std::cerr << "\nReceived signal " << signal << ", shutting down gracefully..." << '\n';
        if (global_server) {
            global_server->request_shutdown();
        }
    };

    auto fatal_error_handler = [](int signal) {
        const char* signal_name = (signal == SIGBUS) ? "SIGBUS" : (signal == SIGSEGV) ? "SIGSEGV" : "UNKNOWN";
        std::cerr << "\nFatal error: received " << signal_name << '\n';
        if (global_server) {
            global_server->close();
        }
        std::exit(1);
    };

    // SIGUSR1 cancels the active simulation without killing the process.
    // TypeScript sends this signal when a tx exceeds its deadline.
    auto cancel_simulation_handler = [](int /*signal*/) {
        auto* token = g_active_cancellation_token.load(std::memory_order_acquire);
        if (token) {
            token->cancel();
        }
    };

    (void)std::signal(SIGTERM, graceful_shutdown_handler);
    (void)std::signal(SIGINT, graceful_shutdown_handler);
    (void)std::signal(SIGUSR1, cancel_simulation_handler);
    (void)std::signal(SIGBUS, fatal_error_handler);
    (void)std::signal(SIGSEGV, fatal_error_handler);

    setup_parent_death_monitoring();

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }

    std::cerr << "aztec-avm IPC server ready" << '\n';

    // Run server with generated dispatch handler.
    // make_avm_handler() handles: msgpack deser, NamedUnion dispatch,
    // shutdown detection, error wrapping. avm_dispatch() provides business logic.
    server->run(make_avm_handler(request, avm_dispatch));

    server->close();
    return 0;
}

} // namespace bb::avm
