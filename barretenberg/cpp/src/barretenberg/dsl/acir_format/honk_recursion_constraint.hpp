// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

template <typename Builder>
using HonkRecursionConstraintOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>;

template <typename Flavor>
[[nodiscard("IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintOutput<
    typename Flavor::CircuitBuilder>
create_honk_recursion_constraints(typename Flavor::CircuitBuilder& builder,
                                  const RecursionConstraint& input,
                                  bool has_valid_witness_assignments = false)
    requires IsRecursiveFlavor<Flavor>;

} // namespace acir_format
