#pragma once

#include <cstddef>
#include <iosfwd>
#include <string>

namespace bb {

/**
 * @brief Process msgpack API commands from an input stream (offline replay / wasm).
 *
 * Reads envelope-framed msgpack commands ([4-byte LE length][8-byte LE request
 * id][payload], the length covering id and payload) from the stream, executes
 * them via the generated bbapi dispatch, and writes envelope-framed responses
 * to stdout, echoing each request id. This is the same framing the live
 * transports use, so one recorded stream replays over a file, a pipe, a socket
 * or shared memory without translation.
 *
 * @param input_stream The input stream to read msgpack commands from
 * @return int Status code: 0 for success, non-zero for errors
 */
int process_msgpack_commands(std::istream& input_stream);

/**
 * @brief Execute the `bb msgpack run` subcommand.
 *
 * Input selection:
 *  - "" or "-"      → serve the process's own stdin/stdout (ipc-runtime pipe transport)
 *  - "*.sock"       → serve a Unix domain socket
 *  - "*.shm"        → serve MPSC shared memory
 *  - existing file  → offline replay of an envelope-framed command stream
 *
 * All inputs use the same request-id envelope framing; the live transports run
 * over the shared ipc-runtime server (completion-order responses via
 * run_reactor), while a file is replayed sequentially in this process.
 *
 * @param msgpack_input_file Input path as above
 * @param max_clients Maximum concurrent clients for IPC servers
 * @param request_ring_size Request ring size for shared memory
 * @param response_ring_size Response ring size for shared memory
 * @return int Status code: 0 for success, non-zero for errors
 */
int execute_msgpack_run(const std::string& msgpack_input_file,
                        int max_clients = 1,
                        size_t request_ring_size = 1024UL * 1024,
                        size_t response_ring_size = 1024UL * 1024);

} // namespace bb
