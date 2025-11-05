#pragma once

#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <unistd.h>
#include <vector>

#ifndef __wasm__
#include "barretenberg/ipc/ipc_server.hpp"
#include <csignal>
#endif

namespace bb {

/**
 * @brief Process msgpack API commands from an input stream
 *
 * This function reads length-encoded msgpack buffers from the provided input stream,
 * deserializes them into Command objects, executes them via the bbapi interface,
 * and writes length-encoded responses back to stdout.
 *
 * The format for each message is:
 * - 4-byte length prefix (little-endian)
 * - msgpack buffer of the specified length
 *
 * @param input_stream The input stream to read msgpack commands from (stdin or file)
 * @return int Status code: 0 for success, non-zero for errors
 */
inline int process_msgpack_commands(std::istream& input_stream)
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
/**
 * @brief Execute msgpack commands over IPC (shared memory or Unix domain socket)
 *
 * This function creates an IPC server that accepts concurrent clients.
 * Clients can send msgpack commands independently, and responses are automatically
 * routed back to the correct client.
 *
 * @param path Path or name for IPC endpoint
 * @param use_shm If true, use shared memory; otherwise use Unix domain socket
 * @param max_clients Maximum number of concurrent clients (default: 1)
 * @return int Status code: 0 for success, non-zero for errors
 */
inline int execute_msgpack_ipc_server(const std::string& path, bool use_shm, int max_clients = 1)
{
    // Create IPC server (either socket or shared memory)
    // Socket server uses int, shared memory uses size_t
    auto server = use_shm ? ipc::IpcServer::create_shm(path, static_cast<size_t>(max_clients))
                          : ipc::IpcServer::create_socket(path, max_clients);

    // Store server pointer for signal handler cleanup (works for both socket and shared memory)
    // MUST be set before listen() since SIGBUS can occur during listen()
    static ipc::IpcServer* global_server = nullptr;
    global_server = server.get();

    // Register signal handlers for graceful cleanup
    // MUST be registered before listen() since SIGBUS can occur during initialization
    // SIGTERM: Sent by processes/test frameworks on shutdown
    // SIGINT: Sent by Ctrl+C
    auto graceful_shutdown_handler = [](int signal) {
        std::cerr << "\nReceived signal " << signal << ", cleaning up..." << '\n';

        // Clean up IPC resources (socket file or shared memory segments)
        if (global_server) {
            global_server->close();
            std::cerr << "Cleaned up IPC resources" << '\n';
        }

        std::exit(0);
    };

    // Register handlers for fatal memory errors (SIGBUS, SIGSEGV)
    // These occur when shared memory exhaustion happens during initialization
    auto fatal_error_handler = [](int signal) {
        const char* signal_name = (signal == SIGBUS) ? "SIGBUS" : (signal == SIGSEGV) ? "SIGSEGV" : "UNKNOWN";
        std::cerr << "\nFatal error: received " << signal_name << " during initialization" << '\n';
        std::cerr << "This likely means shared memory exhaustion (try reducing --max-clients)" << '\n';

        // Clean up IPC resources before exiting
        if (global_server) {
            global_server->close();
            std::cerr << "Cleaned up IPC resources" << '\n';
        }

        std::exit(1); // Exit with error code
    };

    std::signal(SIGTERM, graceful_shutdown_handler);
    std::signal(SIGINT, graceful_shutdown_handler);
    std::signal(SIGBUS, fatal_error_handler);
    std::signal(SIGSEGV, fatal_error_handler);

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server at " << path << '\n';
        return 1;
    }

    std::cerr << (use_shm ? "Shared memory" : "Socket") << " server ready at " << path << '\n';
    std::cerr << "Max clients: " << max_clients << '\n';

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
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << '\n';
            return {};
        }
    });

    // Clean up IPC resources on normal exit (e.g., after Shutdown command)
    // The close() method handles cleanup for both socket and shared memory
    server->close();
    std::cerr << "Cleaned up IPC resources" << '\n';

    return 0;
}
#endif

/**
 * @brief Execute msgpack run command
 *
 * This function handles the msgpack run subcommand, reading commands from either
 * stdin, a specified file, a Unix domain socket (if path ends in .sock), or
 * shared memory IPC (if path ends in .shm).
 *
 * @param msgpack_input_file Path to input file (empty string means use stdin,
 *                          .sock suffix means Unix socket, .shm suffix means shared memory)
 * @param max_clients Maximum number of concurrent clients for IPC servers (default: 1)
 * @return int Status code: 0 for success, non-zero for errors
 */
inline int execute_msgpack_run(const std::string& msgpack_input_file, int max_clients = 1)
{
#ifndef __wasm__
    // Check if this is a shared memory path (ends with .shm)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 4 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 4) == ".shm") {
        // Strip .shm suffix to get base name
        std::string base_name = msgpack_input_file.substr(0, msgpack_input_file.size() - 4);
        return execute_msgpack_ipc_server(base_name, true, max_clients);
    }

    // Check if this is a Unix domain socket path (ends with .sock)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 5 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 5) == ".sock") {
        return execute_msgpack_ipc_server(msgpack_input_file, false, max_clients);
    }
#else
    (void)max_clients;
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
