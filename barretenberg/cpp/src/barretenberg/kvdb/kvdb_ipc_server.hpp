#pragma once

#include <cstdint>
#include <string>

namespace bb::kvdb {

/**
 * @brief Run the aztec-kvdb IPC server until shutdown.
 *
 * Opens the LMDB store at `data_dir` (creating it if missing), then listens
 * on `input_path` for msgpack-encoded KvdbCommand requests. The path's suffix
 * picks the transport: `.sock` for Unix Domain Socket, `.shm` for MPSC shared
 * memory.
 */
int execute_kvdb_server(const std::string& input_path,
                        const std::string& data_dir,
                        uint64_t map_size_bytes,
                        uint32_t max_readers,
                        size_t request_ring_size,
                        size_t response_ring_size);

} // namespace bb::kvdb
