#pragma once
#include "recursion_constraint.hpp"
// WORKTODO: huge header here
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {
using Builder = bb::UltraCircuitBuilder;

using namespace bb;

// In Honk, the proof starts with circuit_size, num_public_inputs, and pub_input_offset. We use this offset to keep
// track of where the public inputs start.
static constexpr size_t HONK_INNER_PUBLIC_INPUT_OFFSET = 3;

struct HonkRecursionConstraint {
    std::vector<uint32_t> key;
    std::vector<uint32_t> proof;
    std::vector<uint32_t> public_inputs;
    uint32_t proof_type;

    friend bool operator==(HonkRecursionConstraint const& lhs, HonkRecursionConstraint const& rhs) = default;
};

AggregationObjectIndices create_honk_recursion_constraints(Builder& builder,
                                                           const HonkRecursionConstraint& input,
                                                           AggregationObjectIndices input_aggregation_object,
                                                           bool has_valid_witness_assignments = false);

} // namespace acir_format
