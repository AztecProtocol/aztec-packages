#ifndef DISABLE_AZTEC_VM

#include "avm_recursion_constraint.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_flavor.hpp"
#include "barretenberg/vm/avm/recursion/recursive_flavor.hpp"
#include "barretenberg/vm/avm/recursion/recursive_verifier.hpp"
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
    using Flavor = bb::avm::AvmFlavor;

    // Relevant source for proof layout: AvmFlavor::Transcript::serialize_full_transcript()
    assert((proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
            (Flavor::NUM_ALL_ENTITIES + 1) * Flavor::NUM_FRS_FR - Flavor::NUM_FRS_COM) %
               (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * (Flavor::BATCHED_RELATION_PARTIAL_LENGTH + 1)) ==
           0);

    // Derivation of circuit size based on the proof
    // Here, we should always get CONST_PROOF_SIZE_LOG_N.
    const auto log_circuit_size =
        (proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
         (Flavor::NUM_ALL_ENTITIES + 1) * Flavor::NUM_FRS_FR - Flavor::NUM_FRS_COM) /
        (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * (Flavor::BATCHED_RELATION_PARTIAL_LENGTH + 1));

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
 * @brief Add constraints required to recursively verify an AVM proof
 *
 * @param builder
 * @param input
 * @param input_aggregation_object_indices. The aggregation object coming from previous Honk/Avm recursion constraints.
 * @param has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 */
PairingPointAccumulatorIndices create_avm_recursion_constraints(
    Builder& builder,
    const RecursionConstraint& input,
    PairingPointAccumulatorIndices input_aggregation_object_indices,
    bool has_valid_witness_assignments)
{
    using Flavor = AvmRecursiveFlavor_<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = bb::avm::AvmRecursiveVerifier_<Flavor>;

    ASSERT(input.proof_type == AVM);

    // Construct an in-circuit representation of the verification key.
    std::vector<field_ct> key_fields;
    key_fields.reserve(input.key.size());
    for (const auto& idx : input.key) {
        auto field = field_ct::from_witness_index(&builder, idx);
        key_fields.emplace_back(field);
    }

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
