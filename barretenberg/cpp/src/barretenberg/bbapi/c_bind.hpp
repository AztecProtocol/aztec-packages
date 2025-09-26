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

// Additional C bindings for Zig integration
extern "C" {
int bbapi_compute_standalone_vk(const uint8_t* bytecode, size_t bytecode_len, uint8_t** out_vk, size_t* out_vk_len);
}
