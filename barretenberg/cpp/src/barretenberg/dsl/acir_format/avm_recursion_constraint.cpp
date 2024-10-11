#ifndef DISABLE_AZTEC_VM

#include "avm_recursion_constraint.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/vm/avm/recursion/avm_recursive_flavor.hpp"
#include "barretenberg/vm/avm/recursion/avm_recursive_verifier.hpp"
#include "barretenberg/vm/avm/trace/common.hpp"
#include "barretenberg/vm/avm/trace/helper.hpp"
#include "barretenberg/vm/aztec_constants.hpp"
#include "proof_surgeon.hpp"
#include <cstddef>

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using aggregation_state_ct = bb::stdlib::recursion::aggregation_state<bn254>;
using VmPublicInputs = avm_trace::VmPublicInputs_<field_ct>;

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
    using Flavor = AvmFlavor;

    // Relevant source for proof layout: AvmFlavor::Transcript::serialize_full_transcript()
    assert((proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
            Flavor::NUM_ALL_ENTITIES * Flavor::NUM_FRS_FR - 2 * Flavor::NUM_FRS_COM - Flavor::NUM_FRS_FR) %
               (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * Flavor::BATCHED_RELATION_PARTIAL_LENGTH) ==
           0);

    // Derivation of circuit size based on the proof
    // Here, we should always get CONST_PROOF_SIZE_LOG_N which is not what is
    // usually set for the AVM proof. As it is a dummy key/proof, it should not matter.
    auto log_circuit_size =
        (proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
         Flavor::NUM_ALL_ENTITIES * Flavor::NUM_FRS_FR - 2 * Flavor::NUM_FRS_COM - Flavor::NUM_FRS_FR) /
        (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * Flavor::BATCHED_RELATION_PARTIAL_LENGTH);

    /***************************************************************************
     *                  Construct Dummy Verification Key
     ***************************************************************************/

    // Relevant source for key layout: AvmFlavor::VerificationKey::to_field_elements()

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

    /***************************************************************************
     *                  Construct Dummy Proof
     ***************************************************************************/

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

    // now the zeromorph commitments
    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.assert_equal(builder.add_variable(frs[0]), proof_fields[offset].witness_index);
        builder.assert_equal(builder.add_variable(frs[1]), proof_fields[offset + 1].witness_index);
        builder.assert_equal(builder.add_variable(frs[2]), proof_fields[offset + 2].witness_index);
        builder.assert_equal(builder.add_variable(frs[3]), proof_fields[offset + 3].witness_index);
        offset += 4;
    }

    // lastly the 2 commitments
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
 * @brief Add constraints required to recursively verify an AVM proof
 *
 * @param builder
 * @param input
 * @param input_aggregation_object_indices. The aggregation object coming from previous Honk/Avm recursion constraints.
 * @param has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 */
AggregationObjectIndices create_avm_recursion_constraints(Builder& builder,
                                                          const RecursionConstraint& input,
                                                          AggregationObjectIndices input_aggregation_object_indices,
                                                          bool has_valid_witness_assignments)
{
    using Flavor = AvmRecursiveFlavor_<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = AvmRecursiveVerifier_<Flavor>;

    ASSERT(input.proof_type == AVM);

    // Construct an in-circuit representation of the verification key.
    std::vector<field_ct> key_fields;
    key_fields.reserve(input.key.size());
    for (const auto& idx : input.key) {
        auto field = field_ct::from_witness_index(&builder, idx);
        key_fields.emplace_back(field);
    }

    // TODO(JEANMON): Once we integrate with public inputs, we will have to decide whether we inject (see
    // ProofSurgeon::create_indices_for_reconstructed_proof) them as part of proof_fields or through some separate
    // argument like in the native verifier. The latter will be favored because the public inputs are not part of the
    // transcript and the verifier code passes the proof to initialize the transcript.
    // Create witness indices for the
    // proof with public inputs reinserted std::vector<uint32_t> proof_indices =
    //     ProofSurgeon::create_indices_for_reconstructed_proof(input.proof, input.public_inputs);

    auto fields_from_witnesses = [&](std::vector<uint32_t> const& input) {
        std::vector<field_ct> result;
        result.reserve(input.size());
        for (const auto& idx : input) {
            auto field = field_ct::from_witness_index(&builder, idx);
            result.emplace_back(field);
        }
        return result;
    };

    const auto proof_fields = fields_from_witnesses(input.proof);
    const auto public_inputs_flattened = fields_from_witnesses(input.public_inputs);

    auto it = public_inputs_flattened.begin();
    VmPublicInputs vm_public_inputs =
        avm_trace::convert_public_inputs(std::vector(it, it + PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH));
    it += PUBLIC_CIRCUIT_PUBLIC_INPUTS_LENGTH;
    std::vector<field_ct> calldata(it, it + AVM_PUBLIC_COLUMN_MAX_SIZE);
    it += AVM_PUBLIC_COLUMN_MAX_SIZE;
    std::vector<field_ct> return_data(it, it + AVM_PUBLIC_COLUMN_MAX_SIZE);

    auto public_inputs_vectors = avm_trace::copy_public_inputs_columns(vm_public_inputs, calldata, return_data);

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        create_dummy_vkey_and_proof(builder, input.proof.size(), input.public_inputs.size(), key_fields, proof_fields);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(builder, key_fields);
    RecursiveVerifier verifier(&builder, vkey);
    aggregation_state_ct input_agg_obj = bb::stdlib::recursion::convert_witness_indices_to_agg_obj<Builder, bn254>(
        builder, input_aggregation_object_indices);
    aggregation_state_ct output_agg_object = verifier.verify_proof(proof_fields, public_inputs_vectors, input_agg_obj);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/996): investigate whether assert_equal on public
    // inputs is important, like what the plonk recursion constraint does.

    return output_agg_object.get_witness_indices();
}

} // namespace acir_format
#endif // DISABLE_AZTEC_VM
