#pragma once
/**
 * @file serve_helper.hpp
 * @brief Factory helpers for instantiating IpcServer from a path string.
 *
 * The make_server() helper picks the right transport (Unix domain socket
 * vs. MPSC shared-memory) based on the input path's suffix:
 * ".sock" → UDS, ".shm" → MPSC-SHM.
 * This keeps per-service main() code free of transport-selection logic.
 */

#include "ipc_runtime/constants.hpp"
#include "ipc_runtime/ipc_client.hpp"
#include "ipc_runtime/ipc_server.hpp"

#include <cstddef>
#include <memory>
#include <string>

namespace ipc {

/// Options for make_server().
struct ServerOptions {
    /// Maximum concurrent SHM clients (only used when .shm path is chosen).
    /// Default 2: enough for a primary client plus one auxiliary native client.
    std::size_t max_shm_clients = 2;
    /// SHM request ring size (per-client → server).
    std::size_t shm_request_ring_size = DEFAULT_RING_SIZE;
    /// SHM response ring size (server → per-client).
    std::size_t shm_response_ring_size = DEFAULT_RING_SIZE;
    /// Listen backlog for UDS mode.
    int socket_backlog = SOCKET_BACKLOG;
};

/**
 * @brief Construct an IpcServer based on the input path's suffix.
 *
 * Recognised inputs:
 *  - "-"      → IpcServer::create_pipe(STDIN_FILENO, STDOUT_FILENO) — serve the
 *               process's own stdio (parent spawned us with piped stdio)
 *  - "*.sock" → IpcServer::create_socket(path, opts.socket_backlog)
 *  - "*.shm"  → IpcServer::create_mpsc_shm(<basename>, opts.max_shm_clients,
 *                                          opts.shm_request_ring_size,
 *                                          opts.shm_response_ring_size)
 * The single-client SHM factories (`IpcServer::create_shm` /
 * `IpcClient::create_shm`) are intentionally not selected by suffix; call
 * them directly when a service does not need multiple producers.
 *
 * Returns nullptr if the suffix is not recognised.
 *
 * @param input_path Path passed by the caller (often a CLI flag).
 * @param opts SHM and socket tuning knobs.
 */
std::unique_ptr<IpcServer> make_server(const std::string& input_path, const ServerOptions& opts = {});

} // namespace ipc
