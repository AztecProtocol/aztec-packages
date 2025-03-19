#pragma once

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct FFDecomposition {
    uint128_t lo;
    uint128_t hi;

    bool operator==(const FFDecomposition& other) const = default;
};

struct LimbsComparisonWitness {
    uint128_t lo;
    uint128_t hi;
    bool borrow;

    bool operator==(const LimbsComparisonWitness& other) const = default;
};

FFDecomposition decompose(const uint256_t& x);
LimbsComparisonWitness limb_gt_witness(const FFDecomposition& a, const FFDecomposition& b, bool allow_eq);

} // namespace bb::avm2::simulation
