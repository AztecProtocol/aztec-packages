#pragma once

#include "barretenberg/bbapi/bbapi.hpp"
#include "barretenberg/bbapi/c_bind.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/ipc/socket/uds_server.h"
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
 * @brief Execute msgpack commands over Unix domain socket
 *
 * This function creates a Unix domain socket server that accepts up to 10 concurrent clients.
 * Each client can send msgpack commands independently, and responses are automatically
 * routed back to the correct client. The server uses epoll for efficient multiplexing.
 *
 * @param socket_path Path to Unix domain socket
 * @return int Status code: 0 for success, non-zero for errors
 */
inline int execute_msgpack_socket_server(const std::string& socket_path)
{
    // Create server with max 10 clients
    struct uds_server* server = uds_server_create(socket_path.c_str(), 10);
    if (!server) {
        std::cerr << "Error: Could not create socket server at " << socket_path << std::endl;
        return 1;
    }

    std::cerr << "Socket server listening at " << socket_path << std::endl;

    // Main server loop: accept clients and process commands
    while (true) {
        // Try to accept new clients (non-blocking)
        int new_client = uds_server_accept(server, 0);
        if (new_client >= 0) {
            std::cerr << "Client " << new_client << " connected" << std::endl;
        }

        // Wait for data from any connected client (100ms timeout)
        int client_id = uds_server_wait_for_data(server, 100);
        if (client_id < 0) {
            // Timeout or no data, loop to try accepting more clients
            continue;
        }

        // Receive msgpack command from this client
        std::vector<uint8_t> buffer(1024 * 1024); // 1MB max message
        ssize_t n = uds_server_recv(server, client_id, buffer.data(), buffer.size());
        if (n < 0) {
            // Client disconnected or error
            std::cerr << "Client " << client_id << " disconnected" << std::endl;
            continue;
        }

        // Deserialize the msgpack buffer
        auto unpacked = msgpack::unpack(reinterpret_cast<const char*>(buffer.data()), static_cast<size_t>(n));
        auto obj = unpacked.get();

        // Validate msgpack structure
        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2) {
            std::cerr << "Error: Invalid msgpack format from client " << client_id << std::endl;
            continue;
        }

        // NOLINTNEXTLINE(cppcoreguidelines-pro-type-union-access)
        auto& arr = obj.via.array;
        if (arr.ptr[0].type != msgpack::type::STR) {
            std::cerr << "Error: Invalid command format from client " << client_id << std::endl;
            continue;
        }

        // Convert to Command and execute
        bb::bbapi::Command command;
        obj.convert(command);
        auto response = bbapi::bbapi(std::move(command));

        // Serialize response
        msgpack::sbuffer response_buffer;
        msgpack::pack(response_buffer, response);

        // Send response back to this specific client
        if (uds_server_send(server, client_id, response_buffer.data(), static_cast<size_t>(response_buffer.size())) <
            0) {
            std::cerr << "Error: Failed to send response to client " << client_id << std::endl;
        }
    }

    uds_server_close(server);
    return 0;
}

/**
 * @brief Execute msgpack run command
 *
 * This function handles the msgpack run subcommand, reading commands from either
 * stdin, a specified file, or a Unix domain socket (if path ends in .sock).
 *
 * @param msgpack_input_file Path to input file (empty string means use stdin, .sock suffix means Unix socket)
 * @return int Status code: 0 for success, non-zero for errors
 */
inline int execute_msgpack_run(const std::string& msgpack_input_file)
{
    // Check if this is a Unix domain socket path (ends with .sock)
    if (!msgpack_input_file.empty() && msgpack_input_file.size() >= 5 &&
        msgpack_input_file.substr(msgpack_input_file.size() - 5) == ".sock") {
        return execute_msgpack_socket_server(msgpack_input_file);
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
