#ifndef DISABLE_AZTEC_VM

#include "barretenberg/dsl/acir_format/avm2_recursion_constraint_mock.hpp"
#include "barretenberg/vm2/common/constants.hpp"
#include "barretenberg/vm2/constraining/flavor.hpp"

#include <cstddef>

namespace acir_format {

void create_dummy_vkey_and_proof(Builder& builder,
                                 [[maybe_unused]] size_t proof_size,
                                 size_t public_inputs_size,
                                 const std::vector<field_ct>& key_fields,
                                 const std::vector<field_ct>& proof_fields)
{
    using Flavor = avm2::AvmFlavor;

    // Relevant source for proof layout: AvmFlavor::Transcript::serialize_full_transcript()
    // TODO(#13390): Revive this assertion (and remove the >= 0 one) once we freeze the number of colums in AVM.
    // assert((proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
    //         (Flavor::NUM_ALL_ENTITIES + 1) * Flavor::NUM_FRS_FR - Flavor::NUM_FRS_COM) %
    //            (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * (Flavor::BATCHED_RELATION_PARTIAL_LENGTH + 1)) ==
    //        0);

    // Derivation of circuit size based on the proof
    // TODO#13390): Revive the following code once we freeze the number of colums in AVM.
    // const auto log_circuit_size =
    //     (proof_size - Flavor::NUM_WITNESS_ENTITIES * Flavor::NUM_FRS_COM -
    //      (Flavor::NUM_ALL_ENTITIES + 1) * Flavor::NUM_FRS_FR - Flavor::NUM_FRS_COM) /
    //     (Flavor::NUM_FRS_COM + Flavor::NUM_FRS_FR * (Flavor::BATCHED_RELATION_PARTIAL_LENGTH + 1));
    const auto log_circuit_size = numeric::get_msb(avm2::CIRCUIT_SUBGROUP_SIZE);

    // First key field is log circuit size
    builder.set_variable(key_fields[0].witness_index, log_circuit_size);
    // Second key field is number of public inputs
    builder.set_variable(key_fields[1].witness_index, public_inputs_size);

    size_t offset = 2;
    for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; ++i) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.set_variable(key_fields[offset].witness_index, frs[0]);
        builder.set_variable(key_fields[offset + 1].witness_index, frs[1]);
        builder.set_variable(key_fields[offset + 2].witness_index, frs[2]);
        builder.set_variable(key_fields[offset + 3].witness_index, frs[3]);
        offset += 4;
    }

    // This routine is adding some placeholders for avm proof and avm vk in the case where witnesses are not present.
    // TODO(#14234)[Unconditional PIs validation]: Remove next line and use offset == 0 for subsequent line.
    builder.set_variable(proof_fields[0].witness_index, 0);
    builder.set_variable(proof_fields[1].witness_index, 1 << log_circuit_size);
    offset = 2; // TODO(#14234)[Unconditional PIs validation]: reset offset = 1

    // Witness Commitments
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.set_variable(proof_fields[offset].witness_index, frs[0]);
        builder.set_variable(proof_fields[offset + 1].witness_index, frs[1]);
        builder.set_variable(proof_fields[offset + 2].witness_index, frs[2]);
        builder.set_variable(proof_fields[offset + 3].witness_index, frs[3]);
        offset += 4;
    }

    // now the univariates
    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH; i++) {
        builder.set_variable(proof_fields[offset].witness_index, fr::random_element());
        offset++;
    }

    // now the sumcheck evaluations
    for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; i++) {
        builder.set_variable(proof_fields[offset].witness_index, fr::random_element());
        offset++;
    }

    // now the gemini fold commitments which are CONST_PROOF_SIZE_LOG_N - 1
    for (size_t i = 1; i < CONST_PROOF_SIZE_LOG_N; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.set_variable(proof_fields[offset].witness_index, frs[0]);
        builder.set_variable(proof_fields[offset + 1].witness_index, frs[1]);
        builder.set_variable(proof_fields[offset + 2].witness_index, frs[2]);
        builder.set_variable(proof_fields[offset + 3].witness_index, frs[3]);
        offset += 4;
    }

    // the gemini fold evaluations which are CONST_PROOF_SIZE_LOG_N
    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N; i++) {
        builder.set_variable(proof_fields[offset].witness_index, fr::random_element());
        offset++;
    }

    // lastly the shplonk batched quotient commitment and kzg quotient commitment
    for (size_t i = 0; i < 2; i++) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.set_variable(proof_fields[offset].witness_index, frs[0]);
        builder.set_variable(proof_fields[offset + 1].witness_index, frs[1]);
        builder.set_variable(proof_fields[offset + 2].witness_index, frs[2]);
        builder.set_variable(proof_fields[offset + 3].witness_index, frs[3]);
        offset += 4;
    }

    // TODO(#13390): Revive the following assertion once we freeze the number of colums in AVM.
    // ASSERT(offset == proof_size);
}

} // namespace acir_format
#endif // DISABLE_AZTEC_VM
