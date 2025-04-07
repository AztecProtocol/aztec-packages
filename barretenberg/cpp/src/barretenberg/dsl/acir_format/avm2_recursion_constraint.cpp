#ifndef DISABLE_AZTEC_VM

#include "avm2_recursion_constraint.hpp"

#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/constraining/recursion/goblin_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"

#include <cstddef>

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using aggregation_state_ct = bb::stdlib::recursion::aggregation_state<Builder>;

namespace {
/**
 * @brief Creates a dummy vkey and proof object.
 * @details Populates the key and proof vectors with dummy values in the write_vk case when we do not have a valid
 * witness. The bulk of the logic is setting up certain values correctly like the circuit size, aggregation object, and
 * commitments.
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
    using Flavor = avm2::AvmFlavor;

    // Relevant source for proof layout: AvmFlavor::Transcript::serialize_full_transcript()
    assert((proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
            (Flavor::NUM_ALL_ENTITIES + 1) * Flavor::NUM_FRS_FR - Flavor::NUM_FRS_COM) %
               (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * (Flavor::BATCHED_RELATION_PARTIAL_LENGTH + 1)) ==
           0);

    // Derivation of circuit size based on the proof
    const auto log_circuit_size =
        (proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
         (Flavor::NUM_ALL_ENTITIES + 1) * Flavor::NUM_FRS_FR - Flavor::NUM_FRS_COM) /
        (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * (Flavor::BATCHED_RELATION_PARTIAL_LENGTH + 1));

    // First key field is circuit size
    builder.assert_equal(builder.add_variable(1 << log_circuit_size), key_fields[0].witness_index);
    // Second key field is number of public inputs
    builder.assert_equal(builder.add_variable(public_inputs_size), key_fields[1].witness_index);

    size_t offset = 2;
    for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; ++i) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.assert_equal(builder.add_variable(frs[0]), key_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(frs[1]), key_fields[offset + 1].witness_index);
        builder.assert_equal(builder.add_variable(frs[2]), key_fields[offset + 2].witness_index);
        builder.assert_equal(builder.add_variable(frs[3]), key_fields[offset + 3].witness_index);
        offset += 4;
    }

    builder.assert_equal(builder.add_variable(1 << log_circuit_size), proof_fields[0].witness_index);
    offset = 1;

    // Witness Commitments
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.assert_equal(builder.add_variable(frs[0]), proof_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(frs[1]), proof_fields[offset + 1].witness_index);
        builder.assert_equal(builder.add_variable(frs[2]), proof_fields[offset + 2].witness_index);
        builder.assert_equal(builder.add_variable(frs[3]), proof_fields[offset + 3].witness_index);
        offset += 4;
    }

    // now the univariates
    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH; i++) {
        builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
        offset++;
    }

    // now the sumcheck evaluations
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

    // the gemini fold evaluations which are CONST_PROOF_SIZE_LOG_N
    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
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

    ASSERT(offset == proof_size);
}

} // namespace

/**
 * @brief Add constraints required to recursively verify an AVM2 proof
 *
 * @param builder
 * @param input
 * @param input_aggregation_object_indices. The aggregation object coming from previous Honk/Avm recursion constraints.
 * @param has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 */
aggregation_state_ct create_avm2_recursion_constraints(Builder& builder,
                                                       const RecursionConstraint& input,
                                                       aggregation_state_ct input_agg_obj,
                                                       bool has_valid_witness_assignments)
{
    using Flavor = avm2::AvmRecursiveFlavor_<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = avm2::AvmRecursiveVerifier_<Flavor>;

    ASSERT(input.proof_type == AVM);

    auto fields_from_witnesses = [&](std::vector<uint32_t> const& input) {
        std::vector<field_ct> result;
        result.reserve(input.size());
        for (const auto& idx : input) {
            result.emplace_back(field_ct::from_witness_index(&builder, idx));
        }
        return result;
    };

    // Construct in-circuit representation of the verification key, proof and public inputs
    const auto key_fields = fields_from_witnesses(input.key);
    const auto proof_fields = fields_from_witnesses(input.proof);
    const auto public_inputs_flattened = fields_from_witnesses(input.public_inputs);

    // We assume a single public input value for now (reverted flag)
    // const auto public_inputs_flattened = fields_from_witnesses(input.public_inputs);

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        create_dummy_vkey_and_proof(builder, input.proof.size(), input.public_inputs.size(), key_fields, proof_fields);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(builder, key_fields);
    RecursiveVerifier verifier(builder, vkey);
    aggregation_state_ct output_agg_object =
        verifier.verify_proof(proof_fields, { public_inputs_flattened }, input_agg_obj);

    return output_agg_object;
}

/**
 * @brief Add constraints associated with recursive verification an AVM2 proof using Goblin
 *
 * @param builder
 * @param input
 * @param input_aggregation_object_indices
 * @param has_valid_witness_assignments
 * @return HonkRecursionConstraintOutput {pairing agg object, ipa claim, ipa proof}
 */
HonkRecursionConstraintOutput create_avm2_recursion_constraints_goblin(
    Builder& builder,
    const RecursionConstraint& input,
    stdlib::recursion::aggregation_state<Builder> input_agg_obj,
    bool has_valid_witness_assignments)
{
    using RecursiveVerifier = avm2::AvmGoblinRecursiveVerifier;

    ASSERT(input.proof_type == AVM);

    auto fields_from_witnesses = [&](std::vector<uint32_t> const& input) {
        std::vector<field_ct> result;
        result.reserve(input.size());
        for (const auto& idx : input) {
            result.emplace_back(field_ct::from_witness_index(&builder, idx));
        }
        return result;
    };

    // Construct in-circuit representations of the verification key, proof and public inputs
    const auto key_fields = fields_from_witnesses(input.key);
    const auto proof_fields = fields_from_witnesses(input.proof);
    const auto public_inputs_flattened = fields_from_witnesses(input.public_inputs);

    // We assume a single public input value for now (reverted flag)
    // const auto public_inputs_flattened = fields_from_witnesses(input.public_inputs);

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        create_dummy_vkey_and_proof(builder, input.proof.size(), input.public_inputs.size(), key_fields, proof_fields);
    }

    // Execute the Goblin AVM2 recursive verifier
    RecursiveVerifier verifier(builder, key_fields);
    auto output_agg_object = verifier.verify_proof(proof_fields, { public_inputs_flattened }, input_agg_obj);

    HonkRecursionConstraintOutput result{ .agg_obj = output_agg_object.aggregation_object,
                                          .ipa_claim = output_agg_object.ipa_claim,
                                          .ipa_proof = output_agg_object.ipa_proof };
    return result;
}

} // namespace acir_format
#endif // DISABLE_AZTEC_VM