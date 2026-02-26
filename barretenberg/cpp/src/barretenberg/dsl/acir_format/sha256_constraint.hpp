// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Luke], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <array>
#include <cstdint>

namespace acir_format {

struct Sha256Compression {
    std::array<WitnessOrConstant<bb::fr>, 16> inputs;
    std::array<WitnessOrConstant<bb::fr>, 8> hash_values;
    std::array<uint32_t, 8> result;

    friend bool operator==(Sha256Compression const& lhs, Sha256Compression const& rhs) = default;
};

template <typename Builder>
void create_sha256_compression_constraints(Builder& builder, const Sha256Compression& constraint);

} // namespace acir_format
