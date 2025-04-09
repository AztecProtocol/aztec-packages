#include "honk_recursion_constraint.hpp"
#include "barretenberg/constants.hpp"
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

#include <cstddef>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib::recursion::honk;
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using aggregation_state_ct = bb::stdlib::recursion::aggregation_state<Builder>;

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
template <typename Flavor>
void create_dummy_vkey_and_proof(Builder& builder,
                                 size_t proof_size,
                                 size_t public_inputs_size,
                                 const std::vector<field_ct>& key_fields,
                                 const std::vector<field_ct>& proof_fields)
{
    using AggregationObject = stdlib::recursion::aggregation_state<Builder>;
    // Set vkey->circuit_size correctly based on the proof size
    ASSERT(proof_size == Flavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
    // Note: this computation should always result in log_circuit_size = CONST_PROOF_SIZE_LOG_N
    auto log_circuit_size = CONST_PROOF_SIZE_LOG_N;
    // First key field is circuit size
    builder.assert_equal(builder.add_variable(1 << log_circuit_size), key_fields[0].witness_index);
    // Second key field is number of public inputs
    builder.assert_equal(builder.add_variable(public_inputs_size), key_fields[1].witness_index);
    // Third key field is the pub inputs offset
    builder.assert_equal(builder.add_variable(Flavor::has_zero_row ? 1 : 0), key_fields[2].witness_index);
    // Fourth key field is the whether the proof contains an aggregation object.
    builder.assert_equal(builder.add_variable(1), key_fields[3].witness_index);
    uint32_t offset = 4;
    size_t num_inner_public_inputs = public_inputs_size - bb::PAIRING_POINT_ACCUMULATOR_SIZE;
    if constexpr (HasIPAAccumulator<Flavor>) {
        num_inner_public_inputs -= bb::IPA_CLAIM_SIZE;
    }

    // We are making the assumption that the pairing point object is behind all the inner public inputs
    for (size_t i = 0; i < bb::PAIRING_POINT_ACCUMULATOR_SIZE; i++) {
        builder.assert_equal(builder.add_variable(num_inner_public_inputs + i), key_fields[offset].witness_index);
        offset++;
    }

    if constexpr (HasIPAAccumulator<Flavor>) {
        // Key field is the whether the proof contains an aggregation object.
        builder.assert_equal(builder.add_variable(1), key_fields[offset++].witness_index);
        // We are making the assumption that the IPA claim is behind the inner public inputs and pairing point object
        for (size_t i = 0; i < bb::IPA_CLAIM_SIZE; i++) {
            builder.assert_equal(builder.add_variable(num_inner_public_inputs + PAIRING_POINT_ACCUMULATOR_SIZE + i),
                                 key_fields[offset].witness_index);
            offset++;
        }
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

    offset = 0; // Reset offset for parsing proof fields

    // the inner public inputs
    for (size_t i = 0; i < num_inner_public_inputs; i++) {
        builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
        offset++;
    }
    // The aggregation object
    for (size_t i = 0; i < AggregationObject::PUBLIC_INPUTS_SIZE; i++) {
        builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
        offset++;
    }

    // IPA claim
    if constexpr (HasIPAAccumulator<Flavor>) {
        for (size_t i = 0; i < bb::IPA_CLAIM_SIZE; i++) {
            builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
            offset++;
        }
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

    // now the univariates, which can just be 0s (8*CONST_PROOF_SIZE_LOG_N Frs, where 8 is the maximum relation
    // degree)
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
    // IPA Proof
    if constexpr (HasIPAAccumulator<Flavor>) {
        // Poly length
        builder.assert_equal(builder.add_variable(1), proof_fields[offset].witness_index);
        offset++;

        // Ls and Rs
        for (size_t i = 0; i < static_cast<size_t>(2) * CONST_ECCVM_LOG_N; i++) {
            auto comm = curve::Grumpkin::AffineElement::one() * fq::random_element();
            auto frs = field_conversion::convert_to_bn254_frs(comm);
            builder.assert_equal(builder.add_variable(frs[0]), proof_fields[offset].witness_index);
            builder.assert_equal(builder.add_variable(frs[1]), proof_fields[offset + 1].witness_index);
            offset += 2;
        }

        // G_zero
        auto G_zero = curve::Grumpkin::AffineElement::one() * fq::random_element();
        auto G_zero_frs = field_conversion::convert_to_bn254_frs(G_zero);
        builder.assert_equal(builder.add_variable(G_zero_frs[0]), proof_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(G_zero_frs[1]), proof_fields[offset + 1].witness_index);
        offset += 2;

        // a_zero
        auto a_zero = fq::random_element();
        auto a_zero_frs = field_conversion::convert_to_bn254_frs(a_zero);
        builder.assert_equal(builder.add_variable(a_zero_frs[0]), proof_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(a_zero_frs[1]), proof_fields[offset + 1].witness_index);
        offset += 2;
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
 * @note We currently only support HonkRecursionConstraint where inner_proof_contains_pairing_point_accumulator = false.
 *       We would either need a separate ACIR opcode where inner_proof_contains_pairing_point_accumulator = true,
 *       or we need non-witness data to be provided as metadata in the ACIR opcode
 */

template <typename Flavor>
HonkRecursionConstraintOutput create_honk_recursion_constraints(
    Builder& builder,
    const RecursionConstraint& input,
    stdlib::recursion::aggregation_state<Builder> input_agg_obj,
    bool has_valid_witness_assignments)
{
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<Flavor>;

    ASSERT(input.proof_type == HONK || HasIPAAccumulator<Flavor>);
    ASSERT((input.proof_type == ROLLUP_HONK || input.proof_type == ROOT_ROLLUP_HONK) == HasIPAAccumulator<Flavor>);

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
        size_t size_of_proof_with_no_pub_inputs = input.proof.size() - bb::PAIRING_POINT_ACCUMULATOR_SIZE;
        if constexpr (HasIPAAccumulator<Flavor>) {
            size_of_proof_with_no_pub_inputs -= bb::IPA_CLAIM_SIZE;
        }
        size_t total_num_public_inputs = input.public_inputs.size() + bb::PAIRING_POINT_ACCUMULATOR_SIZE;
        if constexpr (HasIPAAccumulator<Flavor>) {
            total_num_public_inputs += bb::IPA_CLAIM_SIZE;
        }
        create_dummy_vkey_and_proof<typename Flavor::NativeFlavor>(
            builder, size_of_proof_with_no_pub_inputs, total_num_public_inputs, key_fields, proof_fields);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(builder, key_fields);
    RecursiveVerifier verifier(&builder, vkey);
    HonkRecursionConstraintOutput output;
    UltraRecursiveVerifierOutput<Flavor> verifier_output = verifier.verify_proof(proof_fields, input_agg_obj);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/996): investigate whether assert_equal on public inputs
    // is important, like what the plonk recursion constraint does.

    output.agg_obj = verifier_output.agg_obj;
    if constexpr (HasIPAAccumulator<Flavor>) {
        ASSERT(HasIPAAccumulator<Flavor>);
        output.ipa_claim = verifier_output.ipa_opening_claim;
        output.ipa_proof = verifier_output.ipa_proof;
    }
    return output;
}

template HonkRecursionConstraintOutput create_honk_recursion_constraints<UltraRecursiveFlavor_<Builder>>(
    Builder& builder,
    const RecursionConstraint& input,
    stdlib::recursion::aggregation_state<Builder> input_agg_obj,
    bool has_valid_witness_assignments);

template HonkRecursionConstraintOutput create_honk_recursion_constraints<UltraRollupRecursiveFlavor_<Builder>>(
    Builder& builder,
    const RecursionConstraint& input,
    stdlib::recursion::aggregation_state<Builder> input_agg_obj,
    bool has_valid_witness_assignments);

} // namespace acir_format
