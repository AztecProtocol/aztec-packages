#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/u256_decomposition.hpp"

namespace bb::avm2::simulation {

struct LimbsComparisonWitness {
    uint128_t lo;
    uint128_t hi;
    bool borrow;

    bool operator==(const LimbsComparisonWitness& other) const = default;
};

struct FieldGreaterThanEvent {
    FF a;
    FF b;
    U256Decomposition a_limbs;
    LimbsComparisonWitness p_sub_a_witness;
    U256Decomposition b_limbs;
    LimbsComparisonWitness p_sub_b_witness;
    LimbsComparisonWitness res_witness;
    bool result;

    bool operator==(const FieldGreaterThanEvent& other) const = default;
};

} // namespace bb::avm2::simulation
