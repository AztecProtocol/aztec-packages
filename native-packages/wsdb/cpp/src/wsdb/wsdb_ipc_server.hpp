#pragma once

#include <cstddef>
#include <string>

namespace azteclabs::wsdb {

/**
 * @brief Start the aztec-wsdb IPC server.
 *
 * Listens on input_path, builds the WsdbService and runs the IPC reactor until shutdown. The service is configured
 * by the first request, Init.
 */
int execute_wsdb_server(const std::string& input_path, size_t request_ring_size, size_t response_ring_size);

} // namespace azteclabs::wsdb
