#ifndef DISABLE_AZTEC_VM
#pragma once

#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace acir_format {

using Builder = bb::UltraCircuitBuilder;

using namespace bb;

stdlib::recursion::aggregation_state<Builder> create_avm2_recursion_constraints(
    Builder& builder,
    const RecursionConstraint& input,
    const stdlib::recursion::aggregation_state<Builder>& input_aggregation_object,
    bool has_valid_witness_assignments);

HonkRecursionConstraintOutput<Builder> create_avm2_recursion_constraints_goblin(
    Builder& builder,
    const RecursionConstraint& input,
    const stdlib::recursion::aggregation_state<Builder>& input_aggregation_object,
    bool has_valid_witness_assignments);

} // namespace acir_format

#endif // DISABLE_AZTEC_VM