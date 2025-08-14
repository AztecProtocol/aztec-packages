// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace acir_format {

using Builder = bb::UltraCircuitBuilder; // Builder is always Ultra

using namespace bb;

[[nodiscard("IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintOutput<Builder>
create_civc_recursion_constraints(Builder& builder,
                                  const RecursionConstraint& input,
                                  bool has_valid_witness_assignments);

} // namespace acir_format
