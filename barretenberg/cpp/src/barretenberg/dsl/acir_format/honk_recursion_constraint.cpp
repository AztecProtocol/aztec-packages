#include "honk_recursion_constraint.hpp"
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
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using aggregation_state_ct = bb::stdlib::recursion::aggregation_state<bn254>;

namespace {
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
    using Flavor = UltraFlavor;

    // Set vkey->circuit_size correctly based on the proof size
    size_t num_frs_comm = bb::field_conversion::calc_num_bn254_frs<Flavor::Commitment>();
    size_t num_frs_fr = bb::field_conversion::calc_num_bn254_frs<Flavor::FF>();
    assert((proof_size - HONK_RECURSION_PUBLIC_INPUT_OFFSET - Flavor::NUM_WITNESS_ENTITIES * num_frs_comm -
            Flavor::NUM_ALL_ENTITIES * num_frs_fr - 2 * num_frs_comm) %
               (num_frs_comm + num_frs_fr * Flavor::BATCHED_RELATION_PARTIAL_LENGTH) ==
           0);
    // Note: this computation should always result in log_circuit_size = CONST_PROOF_SIZE_LOG_N
    auto log_circuit_size =
        (proof_size - HONK_RECURSION_PUBLIC_INPUT_OFFSET - Flavor::NUM_WITNESS_ENTITIES * num_frs_comm -
         Flavor::NUM_ALL_ENTITIES * num_frs_fr - 2 * num_frs_comm) /
        (num_frs_comm + num_frs_fr * Flavor::BATCHED_RELATION_PARTIAL_LENGTH);
    // First key field is circuit size
    builder.assert_equal(builder.add_variable(1 << log_circuit_size), key_fields[0].witness_index);
    // Second key field is number of public inputs
    builder.assert_equal(builder.add_variable(public_inputs_size), key_fields[1].witness_index);
    // Third key field is the pub inputs offset
    builder.assert_equal(builder.add_variable(Flavor::has_zero_row ? 1 : 0), key_fields[2].witness_index);
    // Fourth key field is the whether the proof contains an aggregation object.
    builder.assert_equal(builder.add_variable(1), key_fields[3].witness_index);
    uint32_t offset = 4;
    size_t num_inner_public_inputs = public_inputs_size - bb::AGGREGATION_OBJECT_SIZE;

    // We are making the assumption that the aggregation object are behind all the inner public inputs
    for (size_t i = 0; i < bb::AGGREGATION_OBJECT_SIZE; i++) {
        builder.assert_equal(builder.add_variable(num_inner_public_inputs + i), key_fields[offset].witness_index);
        offset++;
    }

    for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; ++i) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.assert_equal(builder.add_variable(frs[0]), key_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(frs[1]), key_fields[offset + 1].witness_index);
        builder.assert_equal(builder.add_variable(frs[2]), key_fields[offset + 2].witness_index);
        builder.assert_equal(builder.add_variable(frs[3]), key_fields[offset + 3].witness_index);
        offset += 4;
    }

    offset = HONK_RECURSION_PUBLIC_INPUT_OFFSET;
    // first 3 things
    builder.assert_equal(builder.add_variable(1 << log_circuit_size), proof_fields[0].witness_index);
    builder.assert_equal(builder.add_variable(public_inputs_size), proof_fields[1].witness_index);
    builder.assert_equal(builder.add_variable(Flavor::has_zero_row ? 1 : 0), proof_fields[2].witness_index);

    // the inner public inputs
    for (size_t i = 0; i < num_inner_public_inputs; i++) {
        builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
        offset++;
    }
    // The aggregation object
    AggregationObjectIndices agg_obj = stdlib::recursion::init_default_agg_obj_indices(builder);
    for (auto idx : agg_obj) {
        builder.assert_equal(idx, proof_fields[offset].witness_index);
        offset++;
    }

    // first 8 witness commitments
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.assert_equal(builder.add_variable(frs[0]), proof_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(frs[1]), proof_fields[offset + 1].witness_index);
        builder.assert_equal(builder.add_variable(frs[2]), proof_fields[offset + 2].witness_index);
        builder.assert_equal(builder.add_variable(frs[3]), proof_fields[offset + 3].witness_index);
        offset += 4;
    }

    // now the univariates, which can just be 0s (8*CONST_PROOF_SIZE_LOG_N Frs, where 8 is the maximum relation degree)
    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH; i++) {
        builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
        offset++;
    }

    // now the sumcheck evaluations, which is just 44 0s
    for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; i++) {
        builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
        offset++;
    }

    // now the gemini fold commitments which are CONST_PROOF_SIZE_LOG_N - 1
    for (size_t i = 1; i < CONST_PROOF_SIZE_LOG_N; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.assert_equal(builder.add_variable(frs[0]), proof_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(frs[1]), proof_fields[offset + 1].witness_index);
        builder.assert_equal(builder.add_variable(frs[2]), proof_fields[offset + 2].witness_index);
        builder.assert_equal(builder.add_variable(frs[3]), proof_fields[offset + 3].witness_index);
        offset += 4;
    }

    // the gemini fold evaluations which are also CONST_PROOF_SIZE_LOG_N
    for (size_t i = 1; i <= CONST_PROOF_SIZE_LOG_N; i++) {
        builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
        offset++;
    }

    // lastly the shplonk batched quotient commitment and kzg quotient commitment
    for (size_t i = 0; i < 2; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.assert_equal(builder.add_variable(frs[0]), proof_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(frs[1]), proof_fields[offset + 1].witness_index);
        builder.assert_equal(builder.add_variable(frs[2]), proof_fields[offset + 2].witness_index);
        builder.assert_equal(builder.add_variable(frs[3]), proof_fields[offset + 3].witness_index);
        offset += 4;
    }
    ASSERT(offset == proof_size + public_inputs_size);
}
} // namespace

/**
 * @brief Add constraints required to recursively verify an UltraHonk proof
 *
 * @param builder
 * @param input
 * @param input_aggregation_object_indices. The aggregation object coming from previous Honk recursion constraints.
 * @param has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 *
 * @note We currently only support HonkRecursionConstraint where inner_proof_contains_recursive_proof = false.
 *       We would either need a separate ACIR opcode where inner_proof_contains_recursive_proof = true,
 *       or we need non-witness data to be provided as metadata in the ACIR opcode
 */
AggregationObjectIndices create_honk_recursion_constraints(Builder& builder,
                                                           const RecursionConstraint& input,
                                                           AggregationObjectIndices input_aggregation_object_indices,
                                                           bool has_valid_witness_assignments)
{
    using Flavor = UltraRecursiveFlavor_<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<Flavor>;

    ASSERT(input.proof_type == HONK);

    // Construct an in-circuit representation of the verification key.
    // For now, the v-key is a circuit constant and is fixed for the circuit.
    // (We may need a separate recursion opcode for this to vary, or add more config witnesses to this opcode)
    std::vector<field_ct> key_fields;
    key_fields.reserve(input.key.size());
    for (const auto& idx : input.key) {
        auto field = field_ct::from_witness_index(&builder, idx);
        key_fields.emplace_back(field);
    }

    std::vector<field_ct> proof_fields;

    // Create witness indices for the proof with public inputs reinserted
    std::vector<uint32_t> proof_indices =
        ProofSurgeon::create_indices_for_reconstructed_proof(input.proof, input.public_inputs);
    proof_fields.reserve(proof_indices.size());
    for (const auto& idx : proof_indices) {
        auto field = field_ct::from_witness_index(&builder, idx);
        proof_fields.emplace_back(field);
    }

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        // In the constraint, the agg object public inputs are still contained in the proof. To get the 'raw' size of
        // the proof and public_inputs we subtract and add the corresponding amount from the respective sizes.
        size_t size_of_proof_with_no_pub_inputs = input.proof.size() - bb::AGGREGATION_OBJECT_SIZE;
        size_t total_num_public_inputs = input.public_inputs.size() + bb::AGGREGATION_OBJECT_SIZE;
        create_dummy_vkey_and_proof(
            builder, size_of_proof_with_no_pub_inputs, total_num_public_inputs, key_fields, proof_fields);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(builder, key_fields);
    RecursiveVerifier verifier(&builder, vkey);
    aggregation_state_ct input_agg_obj = bb::stdlib::recursion::convert_witness_indices_to_agg_obj<Builder, bn254>(
        builder, input_aggregation_object_indices);
    aggregation_state_ct output_agg_object = verifier.verify_proof(proof_fields, input_agg_obj);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/996): investigate whether assert_equal on public inputs
    // is important, like what the plonk recursion constraint does.

    return output_agg_object.get_witness_indices();
}

} // namespace acir_format
