#pragma once

#include <string>

namespace bb::avm {

/**
 * @brief Start the aztec-avm IPC server.
 *
 * Connects to WSDB and CDB as IPC clients, then runs the server loop
 * dispatching incoming simulation commands.
 *
 * @param input_path IPC socket path for TS client connections.
 * @param wsdb_path Socket path to the running aztec-wsdb server.
 * @param cdb_path Socket path to the running aztec-cdb server.
 * @return 0 on success, non-zero on error.
 */
int execute_avm_server(const std::string& input_path, const std::string& wsdb_path, const std::string& cdb_path);

} // namespace bb::avm
