// === AUDIT STATUS ===
// internal:    { status: Complete, auditors: [Nishat], commit: 5be53b6f75bac06d6d0132220044b28777021f0f }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace acir_format {

struct Keccakf1600 {
    std::array<WitnessOrConstant<bb::fr>, 25> state;
    std::array<uint32_t, 25> result;

    friend bool operator==(Keccakf1600 const& lhs, Keccakf1600 const& rhs) = default;
};

template <typename Builder>
void create_keccak_permutations_constraints(Builder& builder, const Keccakf1600& constraint);

} // namespace acir_format
