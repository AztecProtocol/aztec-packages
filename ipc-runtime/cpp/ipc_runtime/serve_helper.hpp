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
  /// SHM request ring size (per-client → server). Default 4 MiB.
  std::size_t shm_request_ring_size = 4 * 1024 * 1024;
  /// SHM response ring size (server → per-client). Default 4 MiB.
  std::size_t shm_response_ring_size = 4 * 1024 * 1024;
  /// Listen backlog for UDS mode.
  int socket_backlog = 1;
};

/**
 * @brief Construct an IpcServer based on the input path's suffix.
 *
 * Recognised suffixes:
 *  - "*.sock" → IpcServer::create_socket(path, opts.socket_backlog)
 *  - "*.shm"  → IpcServer::create_mpsc_shm(<basename>, opts.max_shm_clients,
 *                                          opts.shm_request_ring_size,
 *                                          opts.shm_response_ring_size)
 *
 * Returns nullptr if the suffix is not recognised.
 *
 * @param input_path Path passed by the caller (often a CLI flag).
 * @param opts SHM and socket tuning knobs.
 */
std::unique_ptr<IpcServer> make_server(const std::string &input_path,
                                       const ServerOptions &opts = {});

/**
 * @brief Construct an IpcClient based on the input path's suffix.
 *
 * Recognised suffixes:
 *  - "*.sock" → IpcClient::create_socket(path)
 *  - "*.shm"  → IpcClient::create_mpsc_shm(<basename>, client_id)
 *
 * Returns nullptr if the suffix is not recognised. `shm_client_id` is only
 * consulted for the SHM path; for MPSC-SHM, each connecting client picks a
 * distinct slot (0..max_clients-1).
 *
 * @param input_path Path passed by the caller (often a CLI flag).
 * @param shm_client_id Client slot to claim in MPSC-SHM mode. Ignored for UDS.
 */
std::unique_ptr<IpcClient> make_client(const std::string &input_path,
                                       std::size_t shm_client_id = 0);

} // namespace ipc
