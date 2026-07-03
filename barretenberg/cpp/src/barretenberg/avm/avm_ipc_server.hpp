#pragma once

#include <string>

namespace bb::avm {

/**
 * @brief Start the bb-avm-sim IPC server.
 *
 * Connects to WSDB and CDB as IPC clients, then runs the server loop
 * dispatching incoming simulation commands.
 *
 * @param input_path IPC path for TS client connections.
 * @param wsdb_path IPC path to the running WSDB server.
 * @param cdb_path IPC path to the running CDB server.
 * @return 0 on success, non-zero on error.
 */
int execute_avm_server(const std::string& input_path, const std::string& wsdb_path, const std::string& cdb_path);

} // namespace bb::avm
