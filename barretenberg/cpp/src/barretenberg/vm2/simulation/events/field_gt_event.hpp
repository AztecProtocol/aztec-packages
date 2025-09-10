#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"

namespace bb::avm2::simulation {

enum class FieldGreaterOperation : uint8_t {
    GREATER_THAN,
    CANONICAL_DECOMPOSITION,
};

struct LimbsComparisonWitness {
    uint128_t lo;
    uint128_t hi;
    bool borrow;

    bool operator==(const LimbsComparisonWitness& other) const = default;
};

// We default initialize fields which are not involved into a canonical decomposition operation.
struct FieldGreaterThanEvent {
    FieldGreaterOperation operation;
    FF a;
    FF b = FF::zero();
    U256Decomposition a_limbs = { 0, 0 };
    LimbsComparisonWitness p_sub_a_witness;
    U256Decomposition b_limbs = { 0, 0 };
    LimbsComparisonWitness p_sub_b_witness = { 0, 0, false };
    LimbsComparisonWitness res_witness = { 0, 0, false };
    bool gt_result = false; // Not relevant for operation == FieldGreaterOperation::CANONICAL_DECOMPOSITIONs

    // To be used with deduplicating event emitters.
    using Key = std::tuple<FieldGreaterOperation, FF, FF>;
    Key get_key() const { return { operation, a, b }; }

    bool operator==(const FieldGreaterThanEvent& other) const = default;
};

} // namespace bb::avm2::simulation
