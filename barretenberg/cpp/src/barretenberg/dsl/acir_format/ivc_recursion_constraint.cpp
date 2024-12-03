#include "ivc_recursion_constraint.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_rollup_recursive_flavor.hpp"
#include "proof_surgeon.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;

ClientIVC create_mock_ivc_from_constraints(const std::vector<RecursionConstraint>& constraints)
{
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

    for (const auto& constraint : constraints) {
        if (static_cast<uint32_t>(PROOF_TYPE::OINK) == constraint.proof_type) {
            mock_ivc_oink_accumulation(ivc, constraint.public_inputs.size());
        } else if (static_cast<uint32_t>(PROOF_TYPE::PG) == constraint.proof_type) {
            // perform equivalent mocking for PG accumulation
        }
    }

    return ivc;
}

/**
 * @brief Populate an IVC instance with data that mimics the state after accumulating the first app (which runs the oink
 * prover)
 *@details Mock state consists a mock verification queue entry of type OINK (proof, VK) and a mocked merge proof
 *
 * @param ivc
 * @param num_public_inputs_app num pub inputs in accumulated app, excluding fixed components, e.g. pairing points
 */
void mock_ivc_oink_accumulation(ClientIVC& ivc, size_t num_public_inputs_app)
{
    ClientIVC::VerifierInputs oink_entry =
        acir_format::create_dummy_vkey_and_proof_oink(ivc.trace_settings, num_public_inputs_app);
    ivc.verification_queue.emplace_back(oink_entry);
    ivc.merge_verification_queue.emplace_back(acir_format::create_dummy_merge_proof());
    ivc.initialized = true;
}

/**
 * @brief Create a mock oink proof and VK that have the correct structure but are not necessarily valid
 *
 */
ClientIVC::VerifierInputs create_dummy_vkey_and_proof_oink(const TraceSettings& trace_settings,
                                                           const size_t num_public_inputs = 0)
{
    using Flavor = MegaFlavor;
    using FF = bb::fr;

    MegaExecutionTraceBlocks blocks;
    blocks.set_fixed_block_sizes(trace_settings);
    blocks.compute_offsets(/*is_structured=*/true);
    size_t structured_dyadic_size = blocks.get_structured_dyadic_size();
    size_t pub_inputs_offset = blocks.pub_inputs.trace_offset;

    ClientIVC::VerifierInputs verifier_inputs;
    verifier_inputs.type = ClientIVC::QUEUE_TYPE::OINK;

    FF mock_val(5);

    auto mock_commitment = curve::BN254::AffineElement::one() * mock_val;
    std::vector<FF> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);

    // Set proof preamble (metadata plus public inputs)
    size_t total_num_public_inputs = num_public_inputs + bb::PAIRING_POINT_ACCUMULATOR_SIZE;
    verifier_inputs.proof.emplace_back(structured_dyadic_size);
    verifier_inputs.proof.emplace_back(total_num_public_inputs);
    verifier_inputs.proof.emplace_back(pub_inputs_offset);
    for (size_t i = 0; i < total_num_public_inputs; ++i) {
        verifier_inputs.proof.emplace_back(0);
    }

    // Witness polynomial commitments
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; ++i) {
        for (const FF& val : mock_commitment_frs) {
            verifier_inputs.proof.emplace_back(val);
        }
    }

    // Set relevant VK metadata and commitments
    verifier_inputs.honk_verification_key = std::make_shared<Flavor::VerificationKey>();
    verifier_inputs.honk_verification_key->circuit_size = structured_dyadic_size;
    verifier_inputs.honk_verification_key->num_public_inputs = total_num_public_inputs;
    verifier_inputs.honk_verification_key->pub_inputs_offset = blocks.pub_inputs.trace_offset; // must be set correctly
    verifier_inputs.honk_verification_key->contains_pairing_point_accumulator = true;
    for (auto& commitment : verifier_inputs.honk_verification_key->get_all()) {
        commitment = mock_commitment;
    }

    return verifier_inputs;
}

/**
 * @brief Create a mock merge proof which has the correct structure but is not necessarily valid
 *
 * @return ClientIVC::MergeProof
 */
ClientIVC::MergeProof create_dummy_merge_proof()
{
    using FF = bb::fr;

    std::vector<FF> proof;

    FF mock_val(5);
    auto mock_commitment = curve::BN254::AffineElement::one() * mock_val;
    std::vector<FF> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);

    // There are 12 entities in the merge protocol (4 columns x 3 components; aggregate transcript, previous aggregate
    // transcript, current transcript contribution)
    const size_t NUM_TRANSCRIPT_ENTITIES = 12;

    // Transcript poly commitments
    for (size_t i = 0; i < NUM_TRANSCRIPT_ENTITIES; ++i) {
        for (const FF& val : mock_commitment_frs) {
            proof.emplace_back(val);
        }
    }
    // Transcript poly evaluations
    for (size_t i = 0; i < NUM_TRANSCRIPT_ENTITIES; ++i) {
        proof.emplace_back(mock_val);
    }
    // Batched KZG quotient commitment
    for (const FF& val : mock_commitment_frs) {
        proof.emplace_back(val);
    }

    return proof;
}

/**
 * @brief Populate VK witness fields from a recursion constraint from a provided VerificationKey
 *
 * @param builder
 * @param mock_verification_key
 * @param key_witness_indices
 */
void populate_dummy_vk_in_constraint(MegaCircuitBuilder& builder,
                                     const std::shared_ptr<MegaFlavor::VerificationKey>& mock_verification_key,
                                     std::vector<uint32_t>& key_witness_indices)
{
    using Flavor = MegaFlavor;
    using FF = Flavor::FF;

    // Convert the VerificationKey to fields
    std::vector<FF> mock_vk_fields = mock_verification_key->to_field_elements();
    ASSERT(mock_vk_fields.size() == key_witness_indices.size());

    // Add the fields to the witness and set the key witness indices accordingly
    for (auto [witness_idx, value] : zip_view(key_witness_indices, mock_vk_fields)) {
        witness_idx = builder.add_variable(value);
    }
}

} // namespace acir_format
