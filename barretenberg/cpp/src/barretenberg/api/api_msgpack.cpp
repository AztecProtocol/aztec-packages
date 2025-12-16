#include "barretenberg/api/api_msgpack.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <fstream>
#include <iostream>
#include <string>
#include <vector>

#ifndef __wasm__
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

        // Deserialize the msgpack buffer
        // The buffer should contain a tuple of arguments (array) matching the bbapi function signature.
        // Since bbapi(Command) takes one argument, we expect a 1-element array containing the Command.
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(buffer.data()), buffer.size());
        auto obj = unpacked.get();

        // First, expect an array (the tuple of arguments)
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
            throw_or_abort("Expected an array of size 1 (tuple of arguments) for bbapi command deserialization");
        }

        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        auto& tuple_arr = obj.via.array;
        auto& command_obj = tuple_arr.ptr[0];

        // Now access the Command itself, which should be an array of size 2 [command-name, payload]
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        if (command_obj.type != msgpack::type::ARRAY || command_obj.via.array.size != 2) {
            throw_or_abort("Expected Command to be an array of size 2 [command-name, payload]");
        }

        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        auto& command_arr = command_obj.via.array;
        if (command_arr.ptr[0].type != msgpack::type::STR) {
            throw_or_abort("Expected first element of Command to be a string (type name)");
        }

        // Convert to Command (which is a NamedUnion)
        bb::bbapi::Command command;
        command_obj.convert(command);

        // Execute the command
        auto response = bbapi::bbapi(std::move(command));

        // Serialize the response
        msgpack::sbuffer response_buffer;
        msgpack::pack(response_buffer, response);

        // Write length-encoded response directly to stdout
        uint32_t response_length = static_cast<uint32_t>(response_buffer.size());
        stdout_stream.write(reinterpret_cast<const char*>(&response_length), sizeof(response_length));
        stdout_stream.write(response_buffer.data(), static_cast<std::streamsize>(response_buffer.size()));
        stdout_stream.flush();
    }

    // Restore original cout buffer
    std::cout.rdbuf(original_cout_buf);
    return 0;
}

#ifndef __wasm__
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
            // Deserialize msgpack command
            // The buffer should contain a tuple of arguments (array) matching the bbapi function signature.
            // Since bbapi(Command) takes one argument, we expect a 1-element array containing the Command.
            auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(request.data()), request.size());
            auto obj = unpacked.get();

            // First, expect an array (the tuple of arguments)
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
                std::cerr << "Error: Expected an array of size 1 (tuple of arguments) from client " << client_id
                          << '\n';
                return {}; // Return empty to skip response
            }

            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            auto& tuple_arr = obj.via.array;
            auto& command_obj = tuple_arr.ptr[0];

            // Now access the Command itself, which should be an array of size 2 [command-name, payload]
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (command_obj.type != msgpack::type::ARRAY || command_obj.via.array.size != 2) {
                std::cerr << "Error: Expected Command to be an array of size 2 [command-name, payload] from client "
                          << client_id << '\n';
                return {};
            }

            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            auto& command_arr = command_obj.via.array;
            if (command_arr.ptr[0].type != msgpack::type::STR) {
                std::cerr << "Error: Expected first element of Command to be a string (type name) from client "
                          << client_id << '\n';
                return {};
            }

            // Check if this is a Shutdown command
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            std::string command_name(command_arr.ptr[0].via.str.ptr, command_arr.ptr[0].via.str.size);
            bool is_shutdown = (command_name == "Shutdown");

            // Convert to Command and execute
            bb::bbapi::Command command;
            command_obj.convert(command);
            auto response = bbapi::bbapi(std::move(command));

            // Serialize response
            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            std::vector<uint8_t> result(response_buffer.data(), response_buffer.data() + response_buffer.size());

            // If this was a shutdown command, throw exception with response
            // This signals the server to send the response and then exit gracefully
            if (is_shutdown) {
                throw ipc::ShutdownRequested(std::move(result));
            }

            return result;
        } catch (const ipc::ShutdownRequested&) {
            // Re-throw shutdown request
            throw;
        } catch (const std::exception& e) {
            // Log error to stderr for debugging (goes to log file if logger enabled)
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << '\n';
            std::cerr.flush();

            // Create error response with exception message
            bb::bbapi::ErrorResponse error_response{ .message = std::string(e.what()) };
            bb::bbapi::CommandResponse response = error_response;

            // Serialize and return error response to client
            msgpack::sbuffer response_buffer;
            msgpack::pack(response_buffer, response);
            return std::vector<uint8_t>(response_buffer.data(), response_buffer.data() + response_buffer.size());
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
#ifndef __wasm__
    // Check if this is a shared memory path (ends with .shm)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 4 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 4) == ".shm") {
        // Strip .shm suffix to get base name
        std::string base_name = msgpack_input_file.substr(0, msgpack_input_file.size() - 4);
        auto server = ipc::IpcServer::create_shm(
            base_name, static_cast<size_t>(max_clients), request_ring_size, response_ring_size);
        std::cerr << "Shared memory server at " << base_name << ", max clients: " << max_clients << '\n';
        return execute_msgpack_ipc_server(std::move(server));
    }

    // Check if this is a Unix domain socket path (ends with .sock)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 5 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 5) == ".sock") {
        auto server = ipc::IpcServer::create_socket(msgpack_input_file, max_clients);
        std::cerr << "Socket server at " << msgpack_input_file << ", max clients: " << max_clients << '\n';
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
