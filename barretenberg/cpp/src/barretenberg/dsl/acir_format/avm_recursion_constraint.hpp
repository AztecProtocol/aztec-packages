#ifndef DISABLE_AZTEC_VM
#pragma once
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace acir_format {
using Builder = bb::UltraCircuitBuilder;

using namespace bb;

PairingPointAccumulatorIndices create_avm_recursion_constraints(Builder& builder,
                                                                const RecursionConstraint& input,
                                                                PairingPointAccumulatorIndices input_aggregation_object,
                                                                bool has_valid_witness_assignments);

} // namespace acir_format
#endif // DISABLE_AZTEC_VM