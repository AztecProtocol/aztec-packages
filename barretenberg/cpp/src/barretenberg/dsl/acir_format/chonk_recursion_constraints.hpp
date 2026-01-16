// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace acir_format {

using namespace bb;

[[nodiscard(
    "IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintOutput<bb::UltraCircuitBuilder>
create_chonk_recursion_constraints(bb::UltraCircuitBuilder& builder, const RecursionConstraint& input);

void create_dummy_vkey_and_proof(UltraCircuitBuilder& builder,
                                 size_t proof_size,
                                 size_t public_inputs_size,
                                 const std::vector<stdlib::field_t<UltraCircuitBuilder>>& key_fields,
                                 const std::vector<stdlib::field_t<UltraCircuitBuilder>>& proof_fields);

} // namespace acir_format
