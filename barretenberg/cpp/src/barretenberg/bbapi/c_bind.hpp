#pragma once
#include "barretenberg/bbapi/bbapi_execute.hpp"
#include "barretenberg/serialize/cbind_fwd.hpp"
#include <vector>

namespace bb::bbapi {
// Function declaration for CLI usage
CommandResponse bbapi(Command&& command);
} // namespace bb::bbapi

// Forward declaration for CBIND
CBIND_DECL(bbapi)
