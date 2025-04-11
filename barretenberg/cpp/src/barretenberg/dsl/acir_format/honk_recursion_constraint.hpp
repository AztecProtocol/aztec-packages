#pragma once
#include "barretenberg/commitment_schemes/claim.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "barretenberg/stdlib/primitives/curves/grumpkin.hpp"
#include <vector>

namespace acir_format {

using namespace bb;

template <typename Builder> struct HonkRecursionConstraintOutput {
    stdlib::recursion::aggregation_state<Builder> agg_obj;
    OpeningClaim<stdlib::grumpkin<Builder>> ipa_claim;
    StdlibProof<Builder> ipa_proof;
};

template <typename Flavor>
HonkRecursionConstraintOutput<typename Flavor::CircuitBuilder> create_honk_recursion_constraints(
    typename Flavor::CircuitBuilder& builder,
    const RecursionConstraint& input,
    stdlib::recursion::aggregation_state<typename Flavor::CircuitBuilder> input_agg_obj,
    bool has_valid_witness_assignments = false)
    requires IsRecursiveFlavor<Flavor>;

} // namespace acir_format
