// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/stdlib/client_ivc_verifier/client_ivc_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/bigfield.hpp"
#include "proof_surgeon.hpp"

namespace acir_format {

using Builder = bb::UltraCircuitBuilder;
using field_ct = stdlib::field_t<Builder>;

using namespace bb;

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

    BB_ASSERT_EQ(input.proof_type, PROOF_TYPE::CIVC);

    // Reconstruct proof indices from proof and public inputs
    std::vector<uint32_t> proof_indices =
        ProofSurgeon::create_indices_for_reconstructed_proof(input.proof, input.public_inputs);

    // Construct field elements from witness indices
    std::vector<field_ct> key_fields = RecursionConstraint::fields_from_witnesses(builder, input.key);
    std::vector<field_ct> proof_fields = RecursionConstraint::fields_from_witnesses(builder, proof_indices);
    field_ct vk_hash = field_ct::from_witness_index(&builder, input.key_hash);

    if (!has_valid_witness_assignments) {
        info("TODO");
    }

    // Recursively verify CIVC proof
    auto mega_vk = std::make_shared<VerificationKey>(builder, key_fields);
    auto mega_vk_and_hash = std::make_shared<RecursiveVKAndHash>(builder, mega_vk, vk_hash);
    ClientIVCRecursiveVerifier verifier(&builder, mega_vk_and_hash);
    ClientIVCRecursiveVerifier::Output verification_output = verifier.verify(proof_fields);

    // Construct output
    HonkRecursionConstraintOutput<Builder> output;
    output.points_accumulator = verification_output.points_accumulator;
    output.ipa_claim = verification_output.opening_claim;
    output.ipa_proof = verification_output.ipa_proof;

    return output;
}

} // namespace acir_format
