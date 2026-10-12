#pragma once

#include <cstddef>
#include <iosfwd>
#include <string>

#if !defined(__wasm__) && !defined(_WIN32)
namespace ipc {
class IpcServer;
}
#endif

namespace bb {

namespace bbapi {
struct BBApiRequest;
}

/**
 * @brief Process msgpack API commands from an input stream (offline replay / wasm).
 *
 * Reads bare length-prefixed msgpack buffers ([4-byte LE length][payload]) from
 * the stream, executes them via the generated bbapi dispatch, and writes
 * length-prefixed responses to stdout. This is the offline-file format; live
 * transports (stdio pipe, socket, shared memory) run over ipc-runtime with its
 * request-id envelope framing instead.
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
 *  - existing file  → offline replay of bare length-prefixed commands
 *
 * All live transports use the shared ipc-runtime server (request-id envelope
 * framing). By default it is served by the serial run() loop, where every bb
 * handler responds inline. With `reactor`, it is served by run_reactor(), so a
 * handler may respond after returning and responses go out as they complete;
 * ChonkBatchVerifierVerify needs this.
 *
 * @param msgpack_input_file Input path as above
 * @param max_clients Maximum concurrent clients for IPC servers
 * @param request_ring_size Request ring size for shared memory
 * @param response_ring_size Response ring size for shared memory
 * @param reactor Serve with run_reactor() so handlers may respond later (live transports only)
 * @return int Status code: 0 for success, non-zero for errors
 */
#if !defined(__wasm__) && !defined(_WIN32)
/**
 * @brief Serve bb's msgpack API on a listening server with its run_reactor() loop, until the server shuts down.
 * @details Commands may respond after their handler returns (ChonkBatchVerifierVerify does). When serving stops,
 * proofs still queued for batch verification are answered as unchecked before this waits for every response.
 */
void serve_msgpack_reactor(ipc::IpcServer& server, bbapi::BBApiRequest& request);
#endif

int execute_msgpack_run(const std::string& msgpack_input_file,
                        int max_clients = 1,
                        size_t request_ring_size = 1024UL * 1024,
                        size_t response_ring_size = 1024UL * 1024,
                        bool reactor = false);

} // namespace bb
