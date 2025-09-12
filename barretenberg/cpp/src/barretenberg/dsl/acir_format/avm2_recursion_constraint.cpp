// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "barretenberg/numeric/bitop/get_msb.hpp"
#ifndef DISABLE_AZTEC_VM

#include "avm2_recursion_constraint.hpp"

#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/recursion/goblin_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"

#include <cstddef>

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using PairingPoints = bb::stdlib::recursion::PairingPoints<Builder>;

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
                                 [[maybe_unused]] size_t proof_size,
                                 const std::vector<field_ct>& key_fields,
                                 const std::vector<field_ct>& proof_fields)
{
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1514): restructure this function to use functions from
    // mock_verifier_inputs
    using Flavor = avm2::AvmFlavor;

    // a lambda that sets dummy commitments
    auto set_dummy_commitment = [&builder](const std::vector<stdlib::field_t<Builder>>& fields, size_t& offset) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.set_variable(fields[offset].witness_index, frs[0]);
        builder.set_variable(fields[offset + 1].witness_index, frs[1]);
        builder.set_variable(fields[offset + 2].witness_index, frs[2]);
        builder.set_variable(fields[offset + 3].witness_index, frs[3]);
        offset += 4;
    };
    // a lambda that sets dummy evaluation in proof fields vector
    auto set_dummy_evaluation_in_proof_fields = [&](size_t& offset) {
        builder.set_variable(proof_fields[offset].witness_index, fr::random_element());
        offset++;
    };

    size_t offset = 0;
    for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; ++i) {
        set_dummy_commitment(key_fields, offset);
    }

    // This routine is adding some placeholders for avm proof and avm vk in the case where witnesses are not present.
    // TODO(#14234)[Unconditional PIs validation]: Remove next line and use offset == 0 for subsequent line.
    builder.set_variable(proof_fields[0].witness_index, 1);
    offset = 1; // TODO(#14234)[Unconditional PIs validation]: reset offset = 1

    // Witness Commitments
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; i++) {
        set_dummy_commitment(proof_fields, offset);
    }

    // now the univariates
    for (size_t i = 0; i < avm2::MAX_AVM_TRACE_LOG_SIZE * Flavor::BATCHED_RELATION_PARTIAL_LENGTH; i++) {
        set_dummy_evaluation_in_proof_fields(offset);
    }

    // now the sumcheck evaluations
    for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; i++) {
        set_dummy_evaluation_in_proof_fields(offset);
    }

    // now the gemini fold commitments which are CONST_PROOF_SIZE_LOG_N - 1
    for (size_t i = 1; i < avm2::MAX_AVM_TRACE_LOG_SIZE; i++) {
        set_dummy_commitment(proof_fields, offset);
    }

    // the gemini fold evaluations which are CONST_PROOF_SIZE_LOG_N
    for (size_t i = 0; i < avm2::MAX_AVM_TRACE_LOG_SIZE; i++) {
        set_dummy_evaluation_in_proof_fields(offset);
    }

    // lastly the shplonk batched quotient commitment and kzg quotient commitment
    for (size_t i = 0; i < 2; i++) {
        set_dummy_commitment(proof_fields, offset);
    }

    // TODO(#13390): Revive the following assertion once we freeze the number of colums in AVM.
    // ASSERT(offset == proof_size);
}

} // namespace

/**
 * @brief Add constraints associated with recursive verification of an AVM2 proof using Goblin
 *
 * @param builder
 * @param input
 * @param input_points_accumulator_indices
 * @param has_valid_witness_assignments
 * @return HonkRecursionConstraintOutput {pairing agg object, ipa claim, ipa proof}
 */
HonkRecursionConstraintOutput<Builder> create_avm2_recursion_constraints_goblin(Builder& builder,
                                                                                const RecursionConstraint& input,
                                                                                bool has_valid_witness_assignments)
{
    using RecursiveVerifier = avm2::AvmGoblinRecursiveVerifier;

    BB_ASSERT_EQ(input.proof_type, AVM);

    // Construct in-circuit representations of the verification key, proof and public inputs
    const auto key_fields = RecursionConstraint::fields_from_witnesses(builder, input.key);
    const auto proof_fields = RecursionConstraint::fields_from_witnesses(builder, input.proof);
    const auto public_inputs_flattened = RecursionConstraint::fields_from_witnesses(builder, input.public_inputs);

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        create_dummy_vkey_and_proof(builder, input.proof.size(), key_fields, proof_fields);
    }

    // Execute the Goblin AVM2 recursive verifier
    RecursiveVerifier verifier(builder, key_fields);

    bb::avm2::AvmGoblinRecursiveVerifier::RecursiveAvmGoblinOutput output =
        verifier.verify_proof(proof_fields, bb::avm2::PublicInputs::flat_to_columns(public_inputs_flattened));

    return output;
}

} // namespace acir_format
#endif // DISABLE_AZTEC_VM
