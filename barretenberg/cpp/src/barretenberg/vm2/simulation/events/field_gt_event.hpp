#pragma once

#include "barretenberg/vm2/simulation/lib/field_comparison.hpp"

namespace bb::avm2::simulation {

struct FieldGreaterThanEvent {
    FF a;
    FF b;
    FFDecomposition a_limbs;
    LimbsComparisonWitness p_sub_a_witness;
    FFDecomposition b_limbs;
    LimbsComparisonWitness p_sub_b_witness;
    LimbsComparisonWitness res_witness;
    bool result;

    bool operator==(const FieldGreaterThanEvent& other) const = default;
};

} // namespace bb::avm2::simulation
