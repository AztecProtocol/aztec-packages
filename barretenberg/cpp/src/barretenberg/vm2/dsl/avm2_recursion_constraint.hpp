// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 54146acfe3568e22f80648f4092e10cb2c8702c2}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace acir_format {

using namespace bb;

[[nodiscard("IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintOutput<UltraCircuitBuilder>
create_avm2_recursion_constraints_goblin(UltraCircuitBuilder& builder, const RecursionConstraint& input);

} // namespace acir_format
