// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include <cstddef>
#include <cstdint>

extern "C" {

using namespace bb;

WASM_EXPORT void blake2s(uint8_t const* data, out_buf32 r);

WASM_EXPORT void blake2s_to_field_(uint8_t const* data, fr::out_buf r);
}
