// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "proof_surgeon.hpp"

namespace acir_format {

using namespace bb;

using Builder = bb::UltraCircuitBuilder; // Builder is always Ultra
using field_ct = stdlib::field_t<Builder>;

template <typename Builder>
using HonkRecursionConstraintOutput = bb::stdlib::recursion::honk::UltraRecursiveVerifierOutput<Builder>;

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
void create_dummy_vkey_and_proof(Builder& builder,
                                 size_t proof_size,
                                 size_t public_inputs_size,
                                 const std::vector<field_ct>& key_fields,
                                 const std::vector<field_ct>& proof_fields)
{
    using ClientIVCRecursiveVerifier = stdlib::recursion::honk::ClientIVCRecursiveVerifier;
    using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;

    BB_ASSERT_EQ(proof_size, ClientIVCRecursiveVerifier::StdlibProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS());

    size_t num_inner_public_inputs = public_inputs_size - IO::PUBLIC_INPUTS_SIZE;
    uint32_t pub_inputs_offset = MegaZKFlavor::has_zero_row ? 1 : 0;

    // Generate mock honk vk
    // Note: log_circuit_size = VIRTUAL_LOG_N
    auto honk_vk = create_mock_honk_vk<MegaZKFlavor, IO>(
        1 << MegaZKFlavor::VIRTUAL_LOG_N, pub_inputs_offset, num_inner_public_inputs);

    // Set honk vk in builder
    size_t offset = 0;
    for (auto& vk_element : honk_vk->to_field_elements()) {
        builder.set_variable(key_fields[offset].witness_index, vk_element);
        offset++;
    }

    // Generate dummy CIVC proof
    bb::HonkProof civc_proof = create_mock_civc_proof<Builder>(num_inner_public_inputs);

    // Set CIVC proof in builder
    offset = 0;
    for (auto& proof_element : civc_proof) {
        builder.set_variable(proof_fields[offset].witness_index, proof_element);
        offset++;
    }

    BB_ASSERT_EQ(offset, proof_size + public_inputs_size);
}

/**
 * @brief Add constraints associated with recursive verification of an CIVC proof
 *
 * @param builder
 * @param input
 * @param input_points_accumulator_indices
 * @param has_valid_witness_assignments
 * @return HonkRecursionConstraintOutput {pairing agg object, ipa claim, ipa proof}
 */
[[nodiscard("IPA claim and Pairing points should be accumulated")]] HonkRecursionConstraintOutput<Builder>
create_civc_recursion_constraints(Builder& builder,
                                  const RecursionConstraint& input,
                                  bool has_valid_witness_assignments)
{
    using ClientIVCRecursiveVerifier = stdlib::recursion::honk::ClientIVCRecursiveVerifier;
    using RecursiveVKAndHash = ClientIVCRecursiveVerifier::RecursiveVKAndHash;
    using VerificationKey = ClientIVCRecursiveVerifier::RecursiveVK;
    using IO = stdlib::recursion::honk::HidingKernelIO<Builder>;

    BB_ASSERT_EQ(input.proof_type, PROOF_TYPE::CIVC);

    // Reconstruct proof indices from proof and public inputs
    std::vector<uint32_t> proof_indices =
        ProofSurgeon<uint32_t>::create_indices_for_reconstructed_proof(input.proof, input.public_inputs);

    // Construct field elements from witness indices
    std::vector<field_ct> key_fields = RecursionConstraint::fields_from_witnesses(builder, input.key);
    std::vector<field_ct> proof_fields = RecursionConstraint::fields_from_witnesses(builder, proof_indices);
    field_ct vk_hash = field_ct::from_witness_index(&builder, input.key_hash);

    if (!has_valid_witness_assignments) {
        size_t total_pub_inputs_size = input.public_inputs.size() + IO::PUBLIC_INPUTS_SIZE;
        size_t proof_size_without_pub_inputs = input.proof.size() - IO::PUBLIC_INPUTS_SIZE;

        create_dummy_vkey_and_proof(
            builder, proof_size_without_pub_inputs, total_pub_inputs_size, key_fields, proof_fields);
    }

    // Recursively verify CIVC proof
    auto mega_vk = std::make_shared<VerificationKey>(key_fields);
    auto mega_vk_and_hash = std::make_shared<RecursiveVKAndHash>(mega_vk, vk_hash);
    ClientIVCRecursiveVerifier::StdlibProof stdlib_proof(proof_fields, input.public_inputs.size());

    ClientIVCRecursiveVerifier verifier(&builder, mega_vk_and_hash);
    ClientIVCRecursiveVerifier::Output verification_output = verifier.verify(stdlib_proof);

    // Construct output
    HonkRecursionConstraintOutput<Builder> output;
    output.points_accumulator = verification_output.points_accumulator;
    output.ipa_claim = verification_output.opening_claim;
    output.ipa_proof = verification_output.ipa_proof;

    return output;
}

} // namespace acir_format
