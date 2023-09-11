#pragma once

#include <barretenberg/barretenberg.hpp>

#include <cstddef>
#include <cstdint>

WASM_EXPORT uint8_t* root_rollup__sim(uint8_t const* root_rollup_inputs_buf,
                                      size_t* root_rollup_public_inputs_size_out,
                                      uint8_t const** root_rollup_public_inputs_buf);