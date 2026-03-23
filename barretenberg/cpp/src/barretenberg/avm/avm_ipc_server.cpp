#include "barretenberg/avm/avm_ipc_server.hpp"
#include "barretenberg/avm/avm_execute.hpp"
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

    // Run server with AVM command handler
    server->run([&request](int client_id, std::span<const uint8_t> raw_request) -> std::vector<uint8_t> {
        try {
            // Deserialize msgpack command
            auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(raw_request.data()), raw_request.size());
            auto obj = unpacked.get();

            // Expect array of size 1 (tuple wrapping)
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
                std::cerr << "Error: Expected array of size 1 from client " << client_id << '\n';
                return {};
            }

            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            auto& command_obj = obj.via.array.ptr[0];

            // Check for shutdown before converting
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (command_obj.type == msgpack::type::ARRAY && command_obj.via.array.size == 2 &&
                command_obj.via.array.ptr[0].type == msgpack::type::STR) {
                // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
                std::string_view command_name(command_obj.via.array.ptr[0].via.str.ptr,
                                              command_obj.via.array.ptr[0].via.str.size);
                bool is_shutdown = (command_name == "AvmShutdown");

                // Convert and execute
                AvmCommand command;
                command_obj.convert(command);
                auto response = avm_dispatch(request, std::move(command));

                // Serialize response
                msgpack::sbuffer response_buffer;
                msgpack::pack(response_buffer, response);
                std::vector<uint8_t> result(response_buffer.data(), response_buffer.data() + response_buffer.size());

                if (is_shutdown) {
                    throw ipc::ShutdownRequested(std::move(result));
                }

                return result;
            }

            // Fallback: try converting directly
            AvmCommand command;
            command_obj.convert(command);
            auto response = avm_dispatch(request, std::move(command));

            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            return std::vector<uint8_t>(response_buffer.data(), response_buffer.data() + response_buffer.size());

        } catch (const ipc::ShutdownRequested&) {
            throw;
        } catch (const std::exception& e) {
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << '\n';
            std::cerr.flush();

            AvmErrorResponse error_response{ .message = std::string(e.what()) };
            AvmCommandResponse response = error_response;

            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            return std::vector<uint8_t>(response_buffer.data(), response_buffer.data() + response_buffer.size());
        }
    });

    server->close();
    return 0;
}

} // namespace bb::avm
