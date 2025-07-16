#pragma once
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/serialize/cbind_fwd.hpp"
#include <vector>

namespace bb::bbapi {
// Function declaration for CLI usage
CommandResponse bbapi(const std::vector<uint8_t>& request_id_bytes, Command&& command);
} // namespace bb::bbapi

// Forward declaration for CBIND
CBIND_DECL(bbapi)