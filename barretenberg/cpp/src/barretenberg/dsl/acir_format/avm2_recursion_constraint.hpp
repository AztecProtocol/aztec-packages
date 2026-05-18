// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"

namespace acir_format {

struct RecursionConstraint;

} // namespace acir_format

namespace bb::stdlib::recursion::honk {

template <typename Builder> struct UltraRecursiveVerifierOutput;

} // namespace bb::stdlib::recursion::honk

namespace acir_format {

using AvmRecursionConstraintOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<bb::UltraCircuitBuilder>;

[[nodiscard("IPA claim and Pairing points should be accumulated")]] AvmRecursionConstraintOutput
create_avm2_recursion_constraints_goblin(bb::UltraCircuitBuilder& builder, const RecursionConstraint& input);

} // namespace acir_format
