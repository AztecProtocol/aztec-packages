#pragma once

#include <string>
#include <vector>

namespace bb::avm {

/**
 * Serves the AVM on input_path until a shutdown signal.
 * @param host_calls `name=path` for each host-call target: Simulate reaches "wsdb" and "cdb".
 */
int execute_avm_server(const std::string& input_path, const std::vector<std::string>& host_calls);

} // namespace bb::avm
