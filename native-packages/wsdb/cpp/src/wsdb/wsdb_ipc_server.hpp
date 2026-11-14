#pragma once

#include <cstddef>
#include <string>

namespace azteclabs::wsdb {

struct WsdbConfig;

/**
 * @brief Start the aztec-wsdb IPC server.
 *
 * Listens on input_path, builds the WsdbService from config and runs the IPC reactor until shutdown.
 */
int execute_wsdb_server(const std::string& input_path,
                        const WsdbConfig& config,
                        size_t request_ring_size,
                        size_t response_ring_size);

} // namespace azteclabs::wsdb
