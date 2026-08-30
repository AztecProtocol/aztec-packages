#pragma once
/**
 * @file constants.hpp
 * @brief Shared transport constants for ipc-runtime.
 *
 * Single definition for the limits and defaults shared across the UDS /
 * SPSC-SHM / MPSC-SHM transports and their language bindings, so they stay
 * consistent. Mirrored for TypeScript in ts/src/types.ts — keep the two in sync.
 */

#include <cstddef>
#include <cstdint>

namespace ipc {

/**
 * Maximum length-prefix value accepted on receive, across all transports and
 * languages. A frame claiming more than this is treated as corruption: the
 * connection is closed (sockets) or the ring is declared corrupt (SHM),
 * instead of allocating/awaiting the claimed size.
 */
inline constexpr uint32_t MAX_FRAME_SIZE = 1024U * 1024 * 1024; // 1 GiB

/**
 * Every frame carries a client-assigned request id (little-endian u64) between
 * the length prefix and the payload; the server echoes it on the response.
 * Clients correlate responses by id, so the server may complete requests in
 * any order — there is no FIFO contract on the wire. Ids are per-connection
 * (random-start counter); 0 is reserved for server-initiated frames such as
 * protocol errors.
 */
inline constexpr size_t FRAME_ID_SIZE = 8;

/**
 * Total budget for connect() retry loops, covering the window where the
 * server process is still starting up. Shared by UDS and SHM clients.
 */
inline constexpr uint64_t CONNECT_RETRY_BUDGET_MS = 5000;
/** Delay between connect() attempts within the retry budget. */
inline constexpr uint64_t CONNECT_RETRY_DELAY_MS = 10;

/** Default ring size for SHM transports (per direction, per client). */
inline constexpr size_t DEFAULT_RING_SIZE = 4 * 1024 * 1024; // 4 MiB

/** Default listen backlog for UDS servers. */
inline constexpr int SOCKET_BACKLOG = 10;

/**
 * Default per-call timeout for client send/receive: 0 = infinite.
 *
 * Timeout semantics, unified across transports:
 *  - IpcClient::send / IpcClient::receive: 0 = block indefinitely.
 *  - IpcServer::wait_for_data: 0 = non-blocking poll (documented exception).
 *  - SHM ring primitives (claim/peek/wait_for_*): 0 = immediate check; the
 *    client/server layers translate 0 → infinite before reaching the rings.
 */
inline constexpr uint64_t DEFAULT_CALL_TIMEOUT_NS = 0;

/** Internal representation of an infinite timeout at the ring layer. */
inline constexpr uint64_t TIMEOUT_INFINITE_NS = UINT64_MAX;

/** Translate the public "0 = infinite" convention to the ring layer's. */
inline constexpr uint64_t normalize_call_timeout(uint64_t timeout_ns)
{
    return timeout_ns == 0 ? TIMEOUT_INFINITE_NS : timeout_ns;
}

} // namespace ipc
