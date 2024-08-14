#pragma once
#include "recursion_constraint.hpp"
// WORKTODO: huge header here
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include <vector>

namespace acir_format {
using Builder = bb::UltraCircuitBuilder;

using namespace bb;

static constexpr size_t HONK_INNER_PUBLIC_INPUT_OFFSET = 3;

AggregationObjectIndices create_honk_recursion_constraints(Builder& builder,
                                                           const RecursionConstraint& input,
                                                           AggregationObjectIndices input_aggregation_object,
                                                           bool has_valid_witness_assignments = false);

} // namespace acir_format
