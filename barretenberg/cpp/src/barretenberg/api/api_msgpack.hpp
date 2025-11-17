#pragma once

#include <cstddef>
#include <iosfwd>
#include <memory>
#include <string>

#ifndef __wasm__
#include "barretenberg/ipc/ipc_server.hpp"
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
int process_msgpack_commands(std::istream& input_stream);

#ifndef __wasm__
/**
 * @brief Execute msgpack commands over IPC
 *
 * Runs an IPC server that accepts concurrent clients.
 * Clients can send msgpack commands independently, and responses are automatically
 * routed back to the correct client.
 *
 * @param server IPC server instance (socket or shared memory)
 * @return int Status code: 0 for success, non-zero for errors
 */
int execute_msgpack_ipc_server(std::unique_ptr<ipc::IpcServer> server);
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
 * @param request_ring_size Request ring buffer size for shared memory (default: 1MB)
 * @param response_ring_size Response ring buffer size for shared memory (default: 1MB)
 * @return int Status code: 0 for success, non-zero for errors
 */
int execute_msgpack_run(const std::string& msgpack_input_file,
                        int max_clients = 1,
                        size_t request_ring_size = 1024UL * 1024,
                        size_t response_ring_size = 1024UL * 1024);

} // namespace bb
