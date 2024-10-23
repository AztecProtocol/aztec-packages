#include "ivc_recursion_constraint.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "proof_surgeon.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;
// using field_ct = stdlib::field_t<Builder>;
// using bn254 = stdlib::bn254<Builder>;
// using aggregation_state_ct = bb::stdlib::recursion::aggregation_state<bn254>;

ClientIVC::VerifierInputs create_dummy_vkey_and_proof_for_ivc([[maybe_unused]] const PROOF_TYPE proof_type,
                                                              [[maybe_unused]] size_t num_public_inputs = 0)
{
    ClientIVC::VerifierInputs verifier_inputs;
    // verifier_inputs.type = proof_type;

    return verifier_inputs;
}

/**
 * @brief Create an mock proof and VK that have the correct structure but are not necessarily valid
 *
 */
ClientIVC::VerifierInputs create_dummy_vkey_and_proof_oink(size_t num_public_inputs = 0)
{
    using Flavor = MegaFlavor;
    using VerificationKey = ClientIVC::VerificationKey;
    using FF = bb::fr;

    ClientIVC::VerifierInputs verifier_inputs;
    verifier_inputs.type = ClientIVC::QUEUE_TYPE::OINK;

    FF mock_val(5);

    auto mock_commitment = curve::BN254::AffineElement::one() * mock_val;
    std::vector<FF> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);

    // Preamble (metadata plus public inputs)
    size_t fixed_num_public_inputs = bb::AGGREGATION_OBJECT_SIZE;
    size_t num_preamble_elements = 3 + num_public_inputs + fixed_num_public_inputs;
    for (size_t i = 0; i < num_preamble_elements; ++i) {
        verifier_inputs.proof.emplace_back(0);
    }

    // Witness polynomial commitments
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; ++i) {
        for (const FF& val : mock_commitment_frs) {
            verifier_inputs.proof.emplace_back(val);
        }
    }

    // auto vkey = verifier_inputs.honk_verification_key;
    // WORKTODO: all these are default init so maybe do nothing here?
    // uint64_t mock_u64(3);
    // vkey->circuit_size = mock_u64;
    // vkey->log_circuit_size = mock_u64;
    // vkey->num_public_inputs = mock_u64;
    // vkey->pub_inputs_offset = mock_u64;
    // vkey->contains_recursive_proof = false;
    // vkey->recursive_proof_public_input_indices = recursive_proof_public_input_indices;
    // vkey->databus_propagation_data = databus_propagation_data;
    verifier_inputs.honk_verification_key = std::make_shared<VerificationKey>();
    verifier_inputs.honk_verification_key->contains_recursive_proof = true;
    for (auto& commitment : verifier_inputs.honk_verification_key->get_all()) {
        commitment = mock_commitment;
    }

    return verifier_inputs;
}

ClientIVC::MergeProof create_dummy_merge_proof()
{
    using FF = bb::fr;

    std::vector<FF> proof;

    FF mock_val(5);
    auto mock_commitment = curve::BN254::AffineElement::one() * mock_val;
    std::vector<FF> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);

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

} // namespace acir_format
