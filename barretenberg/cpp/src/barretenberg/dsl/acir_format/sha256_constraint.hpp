// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace acir_format {

struct Sha256Input {
    uint32_t witness;
    uint32_t num_bits;

    friend bool operator==(Sha256Input const& lhs, Sha256Input const& rhs) = default;
};

struct Sha256Compression {
    std::array<WitnessOrConstant<bb::fr>, 16> inputs;
    std::array<WitnessOrConstant<bb::fr>, 8> hash_values;
    std::array<uint32_t, 8> result;

    friend bool operator==(Sha256Compression const& lhs, Sha256Compression const& rhs) = default;
};

template <typename Builder>
void create_sha256_compression_constraints(Builder& builder, const Sha256Compression& constraint);

} // namespace acir_format
