#pragma once

#include "field/field_element.hpp"
#include <cstddef>
#include <cstdint>
#include <vector>

// Flat C ABI into barretenberg's Poseidon2 (defined in libbarretenberg.a,
// crypto/poseidon2/poseidon2_capi.cpp). Field elements cross as 32 canonical bytes.
// This is the only computation wsdb cannot own: the hash must match what the AVM
// proves and what is committed on L1, so it is single-sourced in barretenberg.
extern "C" {
void bb_poseidon2_hash(const uint8_t* elems, size_t n, uint8_t* out);
void bb_poseidon2_hash_pair_with_separator(uint64_t separator, const uint8_t* lhs, const uint8_t* rhs, uint8_t* out);
}

namespace azteclabs::wsdb {

inline FieldElement poseidon2_hash(const std::vector<FieldElement>& inputs)
{
    std::vector<uint8_t> buf(inputs.size() * 32);
    for (size_t i = 0; i < inputs.size(); ++i) {
        std::memcpy(buf.data() + (i * 32), inputs[i].data(), 32);
    }
    FieldElement out;
    bb_poseidon2_hash(buf.data(), inputs.size(), out.data());
    return out;
}

inline FieldElement poseidon2_hash_pair_with_separator(uint64_t separator,
                                                       const FieldElement& lhs,
                                                       const FieldElement& rhs)
{
    FieldElement out;
    bb_poseidon2_hash_pair_with_separator(separator, lhs.data(), rhs.data(), out.data());
    return out;
}

} // namespace azteclabs::wsdb
