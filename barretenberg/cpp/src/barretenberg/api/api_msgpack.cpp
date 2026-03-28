#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/bbapi/generated/bb_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#if !defined(__wasm__) && !defined(_WIN32)
#include "barretenberg/common/parent_monitor.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include <csignal>
#endif

namespace bb {

int process_msgpack_commands(std::istream& input_stream)
{
    // Redirect std::cout to stderr to prevent accidental writes to stdout
    auto* original_cout_buf = std::cout.rdbuf();
    std::cout.rdbuf(std::cerr.rdbuf());

    // Create an ostream that writes directly to stdout
    std::ostream stdout_stream(original_cout_buf);

    // Create generated dispatch handler
    static bbapi::BbRequest bb_request;
    auto handler = bbapi::make_bb_handler(bb_request);

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

        // Dispatch via generated handler
        auto response_bytes = handler(buffer);

        // Write length-encoded response directly to stdout
        uint32_t response_length = static_cast<uint32_t>(response_bytes.size());
        stdout_stream.write(reinterpret_cast<const char*>(&response_length), sizeof(response_length));
        stdout_stream.write(reinterpret_cast<const char*>(response_bytes.data()),
                            static_cast<std::streamsize>(response_bytes.size()));
        stdout_stream.flush();
    }

    // Restore original cout buffer
    std::cout.rdbuf(original_cout_buf);
    return 0;
}

#if !defined(__wasm__) && !defined(_WIN32)
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

    // Parent death monitoring: request shutdown when parent (e.g. Node.js) exits.
    // On Linux: SIGTERM is delivered, handled by graceful_shutdown_handler above.
    // On macOS: kqueue thread calls request_shutdown() directly.
    bb::monitor_parent_process([&server]() {
        if (server) {
            server->request_shutdown();
        }
    });

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }

    std::cerr << "IPC server ready" << '\n';

    // Use generated dispatch handler, adapted for ipc::IpcServer::Handler signature.
    // Generated handler: (const vector<uint8_t>&) -> vector<uint8_t>
    // IPC server expects: (int client_id, span<const uint8_t>) -> vector<uint8_t>
    static bbapi::BbRequest bb_request;
    auto generated_handler = bbapi::make_bb_handler(bb_request);
    server->run([&generated_handler](int /*client_id*/, std::span<const uint8_t> raw_request) -> std::vector<uint8_t> {
        std::vector<uint8_t> request_vec(raw_request.begin(), raw_request.end());
        return generated_handler(request_vec);
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
