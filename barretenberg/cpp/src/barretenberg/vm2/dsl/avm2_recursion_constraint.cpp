// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "avm2_recursion_constraint.hpp"

#include "barretenberg/numeric/bitop/get_msb.hpp"

#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/two_layer_avm_recursive_verifier.hpp"

#include <cstddef>

namespace acir_format {

using namespace bb;

/**
 * @brief Add constraints associated with recursive verification of an AVM2 proof using Goblin
 *
 * @param builder
 * @param input
 * @return HonkRecursionConstraintOutput {pairing agg object, ipa claim, ipa proof}
 */
HonkRecursionConstraintOutput<UltraCircuitBuilder> create_avm2_recursion_constraints_goblin(
    UltraCircuitBuilder& builder, const RecursionConstraint& input)
{
    BB_ASSERT_EQ(input.proof_type, AVM);

    // Construct in-circuit representations of the proof and public inputs
    const auto proof_fields = fields_from_witnesses(builder, input.proof);
    const auto public_inputs_flattened = fields_from_witnesses(builder, input.public_inputs);

    // Populate the proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (builder.is_write_vk_mode()) {
        populate_fields(builder, proof_fields, create_mock_avm_proof_without_pub_inputs(/*add_padding=*/true));
    }

    // Execute the TwoLayerAvmRecursiveVerifier recursive verifier
    avm2::TwoLayerAvmRecursiveVerifier verifier(builder);

    bb::avm2::TwoLayerAvmRecursiveVerifier::TwoLayerAvmRecursiveVerifierOutput output =
        verifier.verify_proof(proof_fields, bb::avm2::PublicInputs::flat_to_columns(public_inputs_flattened));

    return output;
}

} // namespace acir_format
