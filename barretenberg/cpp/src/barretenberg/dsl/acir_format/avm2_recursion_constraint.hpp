// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: 0e37cb8}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/eccvm/eccvm_verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"

namespace acir_format {

using namespace bb;

struct AvmRecursionConstraintOutput {
    stdlib::recursion::PairingPoints<stdlib::bn254<bb::UltraCircuitBuilder>> points_accumulator;
    bb::ECCVMRecursiveVerifier::DeferredTripleIpaOpening triple_ipa_opening;
};

[[nodiscard("TripleIPA opening and pairing points should be accumulated")]] AvmRecursionConstraintOutput
create_avm2_recursion_constraints_goblin(bb::UltraCircuitBuilder& builder, const RecursionConstraint& input);

} // namespace acir_format
