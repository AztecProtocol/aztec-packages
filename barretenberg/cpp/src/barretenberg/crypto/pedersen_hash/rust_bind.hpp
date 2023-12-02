#pragma once
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

extern "C" {

using namespace barretenberg;

WASM_EXPORT const char* rust_pedersen_hash(uint8_t const* inputs_buffer, uint32_t const* hash_index, uint8_t* output);
WASM_EXPORT const char* rust_pedersen_hash_buffer(uint8_t const* input_buffer, uint32_t const* hash_index, uint8_t* output);
}