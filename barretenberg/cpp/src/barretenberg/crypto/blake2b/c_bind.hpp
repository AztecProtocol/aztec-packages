// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstddef>
#include <cstdint>

extern "C" {

using namespace bb;

WASM_EXPORT void blake2b(uint8_t const* data, uint8_t* r);

WASM_EXPORT void blake2b_to_field_(uint8_t const* data, fr::out_buf r);
}