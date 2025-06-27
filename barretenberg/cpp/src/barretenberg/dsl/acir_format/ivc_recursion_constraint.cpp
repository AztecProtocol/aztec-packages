// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "ivc_recursion_constraint.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "proof_surgeon.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;

/**
 * @brief Create an IVC object with mocked state corresponding to a set of IVC recursion constraints
 * @details Construction of a kernel circuit requires two inputs: kernel prgram acir constraints and an IVC instance
 * containing state needed to complete the kernel logic, e.g. proofs for input to recursive verifiers. To construct
 * verification keys for kernel circuits without running a full IVC, we mock the IVC state corresponding to a provided
 * set of IVC recurson constraints. For example, if the constraints contain a single PG recursive verification, we
 * initialize an IVC with mocked data for the verifier accumulator, the folding proof, the circuit verification key,
 * and a merge proof.
 * @note There are only three valid combinations of IVC recursion constraints for a kernel program. See below for
 * details.
 *
 * @param constraints IVC recursion constraints from a kernel circuit
 * @param trace_settings
 * @return ClientIVC
 */
std::shared_ptr<ClientIVC> create_mock_ivc_from_constraints(const std::vector<RecursionConstraint>& constraints,
                                                            const TraceSettings& trace_settings)
{
    auto ivc = std::make_shared<ClientIVC>(trace_settings);

    uint32_t oink_type = static_cast<uint32_t>(PROOF_TYPE::OINK);
    uint32_t pg_type = static_cast<uint32_t>(PROOF_TYPE::PG);

    // There are only three valid combinations of IVC recursion constraints for Aztec kernel circuits:

    // Case: INIT kernel; single Oink recursive verification of an app
    if (constraints.size() == 1 && constraints[0].proof_type == oink_type) {
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::OINK, /*is_kernel=*/false);
        return ivc;
    }

    // Case: RESET or TAIL kernel; single PG recursive verification of a kernel
    if (constraints.size() == 1 && constraints[0].proof_type == pg_type) {
        ivc->verifier_accumulator = create_mock_decider_vk();
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        return ivc;
    }

    // Case: INNER kernel; two PG recursive verifications, kernel and app in that order
    if (constraints.size() == 2) {
        ASSERT(constraints[0].proof_type == pg_type && constraints[1].proof_type == pg_type);
        ivc->verifier_accumulator = create_mock_decider_vk();
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/true);
        mock_ivc_accumulation(ivc, ClientIVC::QUEUE_TYPE::PG, /*is_kernel=*/false);
        return ivc;
    }

    ASSERT(false && "WARNING: Invalid set of IVC recursion constraints!");
    return ivc;
}

/**
 * @brief Populate an IVC instance with data that mimics the state after a single IVC accumulation (Oink or PG)
 * @details Mock state consists of a mock verification queue entry of type OINK (proof, VK) and a mocked merge proof
 *
 * @param ivc
 * @param num_public_inputs_app num pub inputs in accumulated app, excluding fixed components, e.g. pairing points
 */
void mock_ivc_accumulation(const std::shared_ptr<ClientIVC>& ivc, ClientIVC::QUEUE_TYPE type, const bool is_kernel)
{
    ClientIVC::VerifierInputs entry =
        acir_format::create_mock_verification_queue_entry(type, ivc->trace_settings, is_kernel);
    ivc->verification_queue.emplace_back(entry);
    ivc->goblin.merge_verification_queue.emplace_back(acir_format::create_dummy_merge_proof());
    ivc->initialized = true;
}

/**
 * @brief Create a mock verification queue entry with proof and VK that have the correct structure but are not
 * necessarily valid
 *
 */
ClientIVC::VerifierInputs create_mock_verification_queue_entry(const ClientIVC::QUEUE_TYPE verification_type,
                                                               const TraceSettings& trace_settings,
                                                               const bool is_kernel)
{
    using FF = ClientIVC::FF;
    using MegaVerificationKey = ClientIVC::MegaVerificationKey;

    // Use the trace settings to determine the correct dyadic size and the public inputs offset
    MegaExecutionTraceBlocks blocks;
    blocks.set_fixed_block_sizes(trace_settings);
    blocks.compute_offsets(/*is_structured=*/true);
    size_t dyadic_size = blocks.get_structured_dyadic_size();
    size_t pub_inputs_offset = blocks.pub_inputs.trace_offset();
    // All circuits have pairing point public inputs; kernels have additional public inputs for two databus commitments
    size_t num_public_inputs = bb::PAIRING_POINTS_SIZE;
    if (is_kernel) {
        num_public_inputs += bb::PROPAGATED_DATABUS_COMMITMENTS_SIZE;
    }

    // Construct a mock Oink or PG proof
    std::vector<FF> proof;
    if (verification_type == ClientIVC::QUEUE_TYPE::OINK) {
        proof = create_mock_oink_proof(num_public_inputs);
    } else { // ClientIVC::QUEUE_TYPE::PG)
        proof = create_mock_pg_proof(num_public_inputs);
    }

    // Construct a mock MegaHonk verification key
    std::shared_ptr<MegaVerificationKey> verification_key =
        create_mock_honk_vk(dyadic_size, num_public_inputs, pub_inputs_offset);

    // If the verification queue entry corresponds to a kernel circuit, set the databus data to indicate the presence of
    // propagated return data commitments on the public inputs
    if (is_kernel) {
        verification_key->databus_propagation_data = bb::DatabusPropagationData::kernel_default();
    }

    return ClientIVC::VerifierInputs{ proof, verification_key, verification_type };
}

/**
 * @brief Create a mock oink proof that has the correct structure but is not in general valid
 *
 */
std::vector<ClientIVC::FF> create_mock_oink_proof(const size_t num_public_inputs)
{
    using Flavor = ClientIVC::Flavor;
    using FF = ClientIVC::FF;

    std::vector<FF> proof;

    // Populate mock public inputs
    // Get some values for a valid aggregation object and use them here to avoid divide by 0 or other issues.
    std::array<fr, stdlib::recursion::PairingPoints<MegaCircuitBuilder>::PUBLIC_INPUTS_SIZE>
        dummy_pairing_points_values = stdlib::recursion::PairingPoints<MegaCircuitBuilder>::construct_dummy();
    size_t public_input_count = 0;
    for (size_t i = 0; i < stdlib::recursion::PairingPoints<MegaCircuitBuilder>::PUBLIC_INPUTS_SIZE; i++) {
        proof.emplace_back(dummy_pairing_points_values[i]);
        public_input_count++;
    }

    if (public_input_count < num_public_inputs) {
        // Databus commitments if necessary
        for (size_t i = 0; i < NUM_DATABUS_COMMITMENTS; ++i) {
            // We represent commitments in the public inputs as biggroup elements.
            using BigGroup = stdlib::element_default::element<MegaCircuitBuilder,
                                                              stdlib::bigfield<MegaCircuitBuilder, bb::Bn254FqParams>,
                                                              stdlib::field_t<MegaCircuitBuilder>,
                                                              curve::BN254::Group>;
            auto pub_input_comm_vals = BigGroup::construct_dummy();
            for (const fr& comm_fr : pub_input_comm_vals) {
                proof.emplace_back(comm_fr);
                public_input_count++;
            }
        }
    }
    BB_ASSERT_EQ(public_input_count, num_public_inputs, "Mock oink proof has the wrong number of public inputs.");

    // Populate mock witness polynomial commitments
    auto mock_commitment = curve::BN254::AffineElement::one();
    std::vector<FF> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; ++i) {
        for (const FF& val : mock_commitment_frs) {
            proof.emplace_back(val);
        }
    }

    return proof;
}

/**
 * @brief Create a mock PG proof that has the correct structure but is not in general valid
 *
 */
std::vector<ClientIVC::FF> create_mock_pg_proof(const size_t num_public_inputs)
{
    using FF = ClientIVC::FF;
    using DeciderProvingKeys = ClientIVC::DeciderProvingKeys;

    // The first part of a PG proof is an Oink proof
    std::vector<FF> proof = create_mock_oink_proof(num_public_inputs);

    // Populate mock perturbator coefficients
    for (size_t idx = 1; idx <= CONST_PG_LOG_N; idx++) {
        proof.emplace_back(0);
    }

    // Populate mock combiner quotient coefficients
    for (size_t idx = DeciderProvingKeys::NUM; idx < DeciderProvingKeys::BATCHED_EXTENDED_LENGTH; idx++) {
        proof.emplace_back(0);
    }

    return proof;
}

/**
 * @brief Create a mock MegaHonk VK that has the correct structure
 *
 */
std::shared_ptr<ClientIVC::MegaVerificationKey> create_mock_honk_vk(const size_t dyadic_size,
                                                                    const size_t num_public_inputs,
                                                                    const size_t pub_inputs_offset)
{
    // Set relevant VK metadata and commitments
    auto honk_verification_key = std::make_shared<ClientIVC::MegaVerificationKey>();
    honk_verification_key->circuit_size = dyadic_size;
    honk_verification_key->num_public_inputs = num_public_inputs;
    honk_verification_key->pub_inputs_offset = pub_inputs_offset; // must be set correctly
    honk_verification_key->pairing_inputs_public_input_key.start_idx = 0;

    for (auto& commitment : honk_verification_key->get_all()) {
        commitment = curve::BN254::AffineElement::one(); // arbitrary mock commitment
    }

    return honk_verification_key;
}

/**
 * @brief Create a mock Decider verification key for initilization of a mock verifier accumulator
 *
 */
std::shared_ptr<ClientIVC::DeciderVerificationKey> create_mock_decider_vk()
{
    using FF = ClientIVC::FF;

    // Set relevant VK metadata and commitments
    auto decider_verification_key = std::make_shared<ClientIVC::DeciderVerificationKey>();
    decider_verification_key->verification_key = create_mock_honk_vk(0, 0, 0); // metadata does not need to be accurate
    decider_verification_key->is_accumulator = true;
    decider_verification_key->gate_challenges = std::vector<FF>(static_cast<size_t>(CONST_PG_LOG_N), 0);

    for (auto& commitment : decider_verification_key->witness_commitments.get_all()) {
        commitment = curve::BN254::AffineElement::one(); // arbitrary mock commitment
    }

    return decider_verification_key;
}

/**
 * @brief Create a mock merge proof which has the correct structure but is not necessarily valid
 *
 * @return Goblin::MergeProof
 */
Goblin::MergeProof create_dummy_merge_proof()
{
    using FF = ClientIVC::FF;

    std::vector<FF> proof;
    proof.reserve(MERGE_PROOF_SIZE);

    FF mock_val(5);
    auto mock_commitment = curve::BN254::AffineElement::one();
    std::vector<FF> mock_commitment_frs = field_conversion::convert_to_bn254_frs(mock_commitment);

    // Populate mock subtable size
    proof.emplace_back(mock_val);

    // There are 8 entities in the merge protocol (4 columns x 2 components; aggregate transcript, previous aggregate
    // transcript) and 12 evalations (4 columns x 3 components; aggregate transcript, previous aggregate
    // transcript, current transcript)
    const size_t NUM_TRANSCRIPT_ENTITIES = 8;
    const size_t NUM_TRANSCRIPT_EVALUATIONS = 12;

    // Transcript poly commitments
    for (size_t i = 0; i < NUM_TRANSCRIPT_ENTITIES; ++i) {
        for (const FF& val : mock_commitment_frs) {
            proof.emplace_back(val);
        }
    }
    // Transcript poly evaluations
    for (size_t i = 0; i < NUM_TRANSCRIPT_EVALUATIONS; ++i) {
        proof.emplace_back(mock_val);
    }
    // Batched KZG quotient commitment
    for (const FF& val : mock_commitment_frs) {
        proof.emplace_back(val);
    }

    BB_ASSERT_EQ(proof.size(), MERGE_PROOF_SIZE);

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
    using FF = ClientIVC::FF;

    // Convert the VerificationKey to fields
    std::vector<FF> mock_vk_fields = mock_verification_key->to_field_elements();
    BB_ASSERT_EQ(mock_vk_fields.size(), key_witness_indices.size());

    // Add the fields to the witness and set the key witness indices accordingly
    for (auto [witness_idx, value] : zip_view(key_witness_indices, mock_vk_fields)) {
        builder.set_variable(witness_idx, value);
    }
}

} // namespace acir_format
