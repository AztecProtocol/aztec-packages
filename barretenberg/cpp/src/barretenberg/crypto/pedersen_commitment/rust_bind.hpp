#pragma once
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

extern "C" {

using namespace barretenberg;

WASM_EXPORT const char* rust_pedersen_commit(fr::vec_in_buf inputs_buffer, fr::out_buf output);
}