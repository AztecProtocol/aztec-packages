#pragma once

#include <cstddef>
#include <cstdint>
#include <string>

namespace bb::wsdb {

/**
 * @brief Start the aztec-wsdb IPC server.
 *
 * Creates a WorldState instance and runs the IPC server loop, dispatching
 * incoming msgpack commands via the WsdbCommand NamedUnion.
 */
int execute_wsdb_server(const std::string& input_path,
                        const std::string& data_dir,
                        const std::string& tree_heights_json,
                        const std::string& tree_prefill_json,
                        const std::string& map_sizes_json,
                        uint32_t threads,
                        uint32_t initial_header_generator_point,
                        const std::string& prefilled_public_data_json,
                        uint64_t genesis_timestamp,
                        size_t request_ring_size,
                        size_t response_ring_size);

} // namespace bb::wsdb
