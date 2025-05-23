// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"

extern "C" {

using namespace bb;

WASM_EXPORT void poseidon2_hash(fr::vec_in_buf inputs_buffer, fr::out_buf output);
WASM_EXPORT void poseidon2_hashes(fr::vec_in_buf inputs_buffer, fr::out_buf output);
WASM_EXPORT void poseidon2_permutation(fr::vec_in_buf inputs_buffer, fr::vec_out_buf output);
WASM_EXPORT void poseidon2_hash_accumulate(fr::vec_in_buf inputs_buffer, fr::out_buf output);
}
