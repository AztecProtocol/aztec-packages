#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include <cstdint>

WASM_EXPORT void sha256__hash(uint8_t const* input, uint32_t const* length_ptr, out_buf32 r);