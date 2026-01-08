// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"

namespace acir_format {

using namespace bb;

/**
 * @brief Creates a dummy vkey and proof object.
 * @details Populates the key and proof vectors with dummy values in the write_vk case when we don't have a valid
 * witness. The bulk of the logic is setting up certain values correctly like the circuit size, number of public inputs,
 * aggregation object, and commitments.
 *
 * @param builder
 * @param proof_size Size of proof with NO public inputs
 * @param public_inputs_size Total size of public inputs including aggregation object
 * @param key_fields
 * @param proof_fields
 */
void create_dummy_vkey_and_proof(UltraCircuitBuilder& builder,
                                 size_t proof_size,
                                 size_t public_inputs_size,
                                 const std::vector<stdlib::field_t<UltraCircuitBuilder>>& key_fields,
                                 const std::vector<stdlib::field_t<UltraCircuitBuilder>>& proof_fields)
{
    using Builder = UltraCircuitBuilder;
    using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;

    BB_ASSERT_EQ(proof_size, ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS);

    size_t num_inner_public_inputs = public_inputs_size - IO::PUBLIC_INPUTS_SIZE;
    uint32_t pub_inputs_offset = MegaZKFlavor::has_zero_row ? 1 : 0;

    // Generate mock honk vk
    // Note: log_circuit_size = VIRTUAL_LOG_N
    auto honk_vk = create_mock_honk_vk<MegaZKFlavor, IO>(
        1 << MegaZKFlavor::VIRTUAL_LOG_N, pub_inputs_offset, num_inner_public_inputs);

    // Set honk vk in builder
    populate_fields(builder, key_fields, honk_vk->to_field_elements());

    // Generate dummy Chonk proof
    bb::HonkProof chonk_proof = create_mock_chonk_proof<Builder>(num_inner_public_inputs);

    // Set Chonk proof in builder
    populate_fields(builder, proof_fields, chonk_proof);

    BB_ASSERT_EQ(chonk_proof.size(), proof_size + public_inputs_size);
}

/**
 * @brief Add constraints associated with recursive verification of a Chonk proof
 *
 * @param builder
 * @param input
 * @param input_points_accumulator_indices
 * @param has_valid_witness_assignments
 * @return HonkRecursionConstraintOutput {pairing agg object, ipa claim, ipa proof}
 */
[[nodiscard(
    "IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintOutput<bb::UltraCircuitBuilder>
create_chonk_recursion_constraints(bb::UltraCircuitBuilder& builder, const RecursionConstraint& input)
{
    using Builder = bb::UltraCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using RecursiveVKAndHash = ChonkRecursiveVerifier::VKAndHash;
    using VerificationKey = ChonkRecursiveVerifier::VK;
    using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;

    BB_ASSERT_EQ(input.proof_type, PROOF_TYPE::CHONK);

    // Reconstruct proof indices from proof and public inputs
    std::vector<uint32_t> proof_indices = add_public_inputs_to_proof(input.proof, input.public_inputs);

    // Construct field elements from witness indices
    std::vector<field_ct> key_fields = fields_from_witnesses(builder, input.key);
    std::vector<field_ct> proof_fields = fields_from_witnesses(builder, proof_indices);
    field_ct vk_hash = field_ct::from_witness_index(&builder, input.key_hash);

    if (builder.is_write_vk_mode()) {
        BB_ASSERT_GTE(input.proof.size(),
                      IO::PUBLIC_INPUTS_SIZE,
                      "create_chonk_recursion_constraints: fewer proof elements than public inputs.");
        BB_ASSERT_LTE(input.public_inputs.size(),
                      SIZE_MAX - IO::PUBLIC_INPUTS_SIZE,
                      "create_chonk_recursion_constraints: too many public inputs.");
        size_t total_pub_inputs_size = input.public_inputs.size() + IO::PUBLIC_INPUTS_SIZE;
        size_t proof_size_without_pub_inputs = input.proof.size() - IO::PUBLIC_INPUTS_SIZE;

        create_dummy_vkey_and_proof(
            builder, proof_size_without_pub_inputs, total_pub_inputs_size, key_fields, proof_fields);
    }

    // Recursively verify Chonk proof
    auto mega_vk = std::make_shared<VerificationKey>(key_fields);
    auto mega_vk_and_hash = std::make_shared<RecursiveVKAndHash>(mega_vk, vk_hash);
    ChonkStdlibProof stdlib_proof = ChonkStdlibProof::from_field_elements(proof_fields);

    ChonkRecursiveVerifier verifier(mega_vk_and_hash);
    ChonkRecursiveVerifier::Output verification_output = verifier.verify(stdlib_proof);

    // Construct output
    // Note: ChonkVerifier aggregates all pairing points (PI + PCS + Merge + Translator)
    HonkRecursionConstraintOutput<Builder> output;
    output.points_accumulator = verification_output.pairing_points;
    output.ipa_claim = verification_output.ipa_claim;
    output.ipa_proof = verification_output.ipa_proof;

    return output;
}

} // namespace acir_format
