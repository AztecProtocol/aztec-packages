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

template <typename Builder, typename Flavor>
HonkRecursionConstraintOutput<Builder> create_honk_recursion_constraints(
    Builder& builder,
    const RecursionConstraint& input,
    stdlib::recursion::aggregation_state<Builder> input_aggregation_object,
    bool has_valid_witness_assignments = false);

} // namespace acir_format
