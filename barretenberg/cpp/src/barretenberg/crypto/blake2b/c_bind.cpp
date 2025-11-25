// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "blake2b.hpp"
#include <barretenberg/common/wasm_export.hpp>

using namespace bb;

WASM_EXPORT void blake2b(uint8_t const* data, uint8_t* out)
{
    std::vector<uint8_t> inputv;
    read(data, inputv);
    auto output = bb::crypto::blake2b(inputv);
    std::copy(output.begin(), output.end(), out);
}

WASM_EXPORT void blake2b_to_field_(uint8_t const* data, fr::out_buf r)
{
    std::vector<uint8_t> inputv;
    read(data, inputv);
    auto output = bb::crypto::blake2b(inputv);
    // Take first 32 bytes and convert to field element
    auto result = bb::fr::serialize_from_buffer(output.data());
    bb::fr::serialize_to_buffer(result, r);
}