#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include <cstdint>
#include <fstream>
#include <iostream>
#include <span>
#include <string>
#include <vector>

#if !defined(__wasm__) && !defined(_WIN32)
#include "barretenberg/ipc/ipc_server.hpp"
#include <csignal>
#include <thread>
#include <unistd.h>
#ifdef __linux__
#include <sys/prctl.h>
#elif defined(__APPLE__)
#include <sys/event.h>
#endif
#endif

namespace bb {

int process_msgpack_commands(std::istream& input_stream)
{
    // Redirect std::cout to stderr to prevent accidental writes to stdout
    auto* original_cout_buf = std::cout.rdbuf();
    std::cout.rdbuf(std::cerr.rdbuf());

    // Create an ostream that writes directly to stdout
    std::ostream stdout_stream(original_cout_buf);

    // Process length-encoded msgpack buffers
    while (!input_stream.eof()) {
        // Read 4-byte length prefix in little-endian format
        uint32_t length = 0;
        input_stream.read(reinterpret_cast<char*>(&length), sizeof(length));

        if (input_stream.gcount() != sizeof(length)) {
            // End of stream or incomplete length
            break;
        }

        // Read the msgpack buffer
        std::vector<uint8_t> buffer(length);
        input_stream.read(reinterpret_cast<char*>(buffer.data()), static_cast<std::streamsize>(length));

        if (input_stream.gcount() != static_cast<std::streamsize>(length)) {
            std::cerr << "Error: Incomplete msgpack buffer read" << '\n';
            // Restore original cout buffer before returning
            std::cout.rdbuf(original_cout_buf);
            return 1;
        }

        auto result = bbapi::execute_msgpack_command_buffer(std::span<const uint8_t>(buffer.data(), buffer.size()));
        if (!result.ok()) {
            throw_or_abort(std::string(bbapi::msgpack_command_error_message(result.error, true)));
        }

        // Write length-encoded response directly to stdout
        uint32_t response_length = static_cast<uint32_t>(result.response.size());
        stdout_stream.write(reinterpret_cast<const char*>(&response_length), sizeof(response_length));
        stdout_stream.write(reinterpret_cast<const char*>(result.response.data()),
                            static_cast<std::streamsize>(result.response.size()));
        stdout_stream.flush();
    }

    // Restore original cout buffer
    std::cout.rdbuf(original_cout_buf);
    return 0;
}

#if !defined(__wasm__) && !defined(_WIN32)
// Set up platform-specific parent death monitoring
// This ensures the bb process exits when the parent (Node.js) dies
static void setup_parent_death_monitoring()
{
#ifdef __linux__
    // Linux: Use prctl to request SIGTERM when parent dies
    // This is kernel-level and very reliable
    if (prctl(PR_SET_PDEATHSIG, SIGTERM) == -1) {
        std::cerr << "Warning: Could not set parent death signal" << '\n';
    }
#elif defined(__APPLE__)
    // macOS: Use kqueue to monitor parent process
    // Spawn a dedicated thread that blocks waiting for parent to exit
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

        // Block until parent exits
        struct kevent event;
        kevent(kq, nullptr, 0, &event, 1, nullptr);

        std::cerr << "Parent process exited, shutting down..." << '\n';
        close(kq);
        std::exit(0);
    }).detach();
#endif
}

int execute_msgpack_ipc_server(std::unique_ptr<ipc::IpcServer> server)
{
    // Store server pointer for signal handler cleanup (works for both socket and shared memory)
    // MUST be set before listen() since SIGBUS can occur during listen()
    static ipc::IpcServer* global_server = server.get();

    // Register signal handlers for graceful cleanup
    // MUST be registered before listen() since SIGBUS can occur during initialization
    // SIGTERM: Sent by processes/test frameworks on shutdown
    // SIGINT: Sent by Ctrl+C
    auto graceful_shutdown_handler = [](int signal) {
        std::cerr << "\nReceived signal " << signal << ", shutting down gracefully..." << '\n';
        if (global_server) {
            global_server->request_shutdown();
        }
    };

    // Register handlers for fatal memory errors (SIGBUS, SIGSEGV)
    // These occur when shared memory exhaustion happens during initialization
    auto fatal_error_handler = [](int signal) {
        const char* signal_name = "UNKNOWN";
        if (signal == SIGBUS) {
            signal_name = "SIGBUS";
        } else if (signal == SIGSEGV) {
            signal_name = "SIGSEGV";
        }
        std::cerr << "\nFatal error: received " << signal_name << " during initialization" << '\n';
        std::cerr << "This likely means shared memory exhaustion (try reducing --max-clients)" << '\n';

        // Clean up IPC resources before exiting
        if (global_server) {
            global_server->close();
        }

        std::exit(1);
    };

    (void)std::signal(SIGTERM, graceful_shutdown_handler);
    (void)std::signal(SIGINT, graceful_shutdown_handler);
    (void)std::signal(SIGBUS, fatal_error_handler);
    (void)std::signal(SIGSEGV, fatal_error_handler);

    // Set up parent death monitoring (kills this process when parent dies)
    setup_parent_death_monitoring();

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }

    std::cerr << "IPC server ready" << '\n';

    // Run server with msgpack handler
    server->run([](int client_id, std::span<const uint8_t> request) -> std::vector<uint8_t> {
        try {
            auto result = bbapi::execute_msgpack_command_buffer(request);
            if (!result.ok()) {
                std::cerr << "Error: " << bbapi::msgpack_command_error_message(result.error) << " from client "
                          << client_id << '\n';
                return {};
            }

            // If this was a shutdown command, throw exception with response
            // This signals the server to send the response and then exit gracefully
            if (result.shutdown) {
                throw ipc::ShutdownRequested(std::move(result.response));
            }

            return std::move(result.response);
        } catch (const ipc::ShutdownRequested&) {
            // Re-throw shutdown request
            throw;
        } catch (const std::exception& e) {
            // Log error to stderr for debugging (goes to log file if logger enabled)
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << '\n';
            std::cerr.flush();

            return bbapi::encode_msgpack_error_response(e.what());
        }
    });

    server->close();
    return 0;
}
#endif

int execute_msgpack_run(const std::string& msgpack_input_file,
                        [[maybe_unused]] int max_clients,
                        [[maybe_unused]] size_t request_ring_size,
                        [[maybe_unused]] size_t response_ring_size)
{
#if !defined(__wasm__) && !defined(_WIN32)
    // Check if this is a shared memory path (ends with .shm)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 4 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 4) == ".shm") {
        // Strip .shm suffix to get base name
        std::string base_name = msgpack_input_file.substr(0, msgpack_input_file.size() - 4);
        auto server = ipc::IpcServer::create_shm(base_name, request_ring_size, response_ring_size);
        std::cerr << "Shared memory server at " << base_name << '\n';
        return execute_msgpack_ipc_server(std::move(server));
    }

    // Check if this is a Unix domain socket path (ends with .sock)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 5 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 5) == ".sock") {
        // Socket server still supports max_clients (multiple clients via MPSC)
        auto server = ipc::IpcServer::create_socket(msgpack_input_file, max_clients);
        std::cerr << "Socket server at " << msgpack_input_file << '\n';
        return execute_msgpack_ipc_server(std::move(server));
    }
#endif

    // Process msgpack API commands from stdin or file
    std::istream* input_stream = &std::cin;
    std::ifstream file_stream;

    if (!msgpack_input_file.empty()) {
        file_stream.open(msgpack_input_file, std::ios::binary);
        if (!file_stream.is_open()) {
            std::cerr << "Error: Could not open input file: " << msgpack_input_file << '\n';
            return 1;
        }
        input_stream = &file_stream;
    }

    return process_msgpack_commands(*input_stream);
}

} // namespace bb
