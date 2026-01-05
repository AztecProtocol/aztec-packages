// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/dsl/acir_format/witness_constant.hpp"
#include <cstdint>
#include <vector>

namespace acir_format {

struct Poseidon2Constraint {
    std::vector<WitnessOrConstant<bb::fr>> state;
    std::vector<uint32_t> result;

    friend bool operator==(Poseidon2Constraint const& lhs, Poseidon2Constraint const& rhs) = default;
};

template <typename Builder>
void create_poseidon2_permutations_constraints(Builder& builder, const Poseidon2Constraint& constraint);

} // namespace acir_format
