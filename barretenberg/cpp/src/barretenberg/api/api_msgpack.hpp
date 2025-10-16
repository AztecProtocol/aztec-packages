#pragma once

#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <fstream>
#include <iostream>
#include <vector>

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
            std::cerr << "Error: Incomplete msgpack buffer read" << std::endl;
            // Restore original cout buffer before returning
            std::cout.rdbuf(original_cout_buf);
            return 1;
        }

        // Deserialize the msgpack buffer
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(buffer.data()), buffer.size());
        auto obj = unpacked.get();
        // access object assuming it is an array of size 2
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2) {
            throw_or_abort("Expected an array of size 2 [command-name, payload] for bbapi command deserialization");
        }
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        auto& arr = obj.via.array;
        if (arr.ptr[0].type != msgpack::type::STR) {
            throw_or_abort("Expected first element to be a string (type name) in bbapi command deserialization");
        }

        // Convert to Command (which is a NamedUnion)
        bb::bbapi::Command command;
        obj.convert(command);

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

/**
 * @brief Execute msgpack commands over IPC (shared memory or Unix domain socket)
 *
 * This function creates an IPC server that accepts up to 10 concurrent clients.
 * Clients can send msgpack commands independently, and responses are automatically
 * routed back to the correct client.
 *
 * @param path Path or name for IPC endpoint
 * @param use_shm If true, use shared memory; otherwise use Unix domain socket
 * @return int Status code: 0 for success, non-zero for errors
 */
inline int execute_msgpack_ipc_server(const std::string& path, bool use_shm)
{
    constexpr int MAX_CLIENTS = 10;

    // Create IPC server (either socket or shared memory)
    auto server =
        use_shm ? ipc::IpcServer::create_shm(path, MAX_CLIENTS) : ipc::IpcServer::create_socket(path, MAX_CLIENTS);

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server at " << path << std::endl;
        return 1;
    }

    std::cerr << (use_shm ? "Shared memory" : "Socket") << " server ready at " << path << std::endl;
    std::cerr << "Max clients: " << MAX_CLIENTS << std::endl;

    // Run server with msgpack handler
    server->run([](int client_id, std::span<const uint8_t> request) -> std::vector<uint8_t> {
        try {
            // Deserialize msgpack command
            auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(request.data()), request.size());
            auto obj = unpacked.get();

            // Validate msgpack structure
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2) {
                std::cerr << "Error: Invalid msgpack format from client " << client_id << std::endl;
                return {}; // Return empty to skip response
            }

            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            auto& arr = obj.via.array;
            if (arr.ptr[0].type != msgpack::type::STR) {
                std::cerr << "Error: Invalid command format from client " << client_id << std::endl;
                return {};
            }

            // Check if this is a Shutdown command
            // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
            std::string command_name(arr.ptr[0].via.str.ptr, arr.ptr[0].via.str.size);
            bool is_shutdown = (command_name == "Shutdown");

            // Convert to Command and execute
            bb::bbapi::Command command;
            obj.convert(command);
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
            std::cerr << "Error processing request from client " << client_id << ": " << e.what() << std::endl;
            return {};
        }
    });

    return 0;
}

/**
 * @brief Execute msgpack run command
 *
 * This function handles the msgpack run subcommand, reading commands from either
 * stdin, a specified file, a Unix domain socket (if path ends in .sock), or
 * shared memory IPC (if path ends in .shm).
 *
 * @param msgpack_input_file Path to input file (empty string means use stdin,
 *                          .sock suffix means Unix socket, .shm suffix means shared memory)
 * @return int Status code: 0 for success, non-zero for errors
 */
inline int execute_msgpack_run(const std::string& msgpack_input_file)
{
    // Check if this is a shared memory path (ends with .shm)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 4 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 4) == ".shm") {
        // Strip .shm suffix to get base name
        std::string base_name = msgpack_input_file.substr(0, msgpack_input_file.size() - 4);
        return execute_msgpack_ipc_server(base_name, true);
    }

    // Check if this is a Unix domain socket path (ends with .sock)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 5 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 5) == ".sock") {
        return execute_msgpack_ipc_server(msgpack_input_file, false);
    }

    // Process msgpack API commands from stdin or file
    std::istream* input_stream = &std::cin;
    std::ifstream file_stream;

    if (!msgpack_input_file.empty()) {
        file_stream.open(msgpack_input_file, std::ios::binary);
        if (!file_stream.is_open()) {
            std::cerr << "Error: Could not open input file: " << msgpack_input_file << std::endl;
            return 1;
        }
        input_stream = &file_stream;
    }

    return process_msgpack_commands(*input_stream);
}

} // namespace bb
