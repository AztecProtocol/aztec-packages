#include "honk_recursion_constraint.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/plonk_honk_shared/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_recursion/verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_recursive_flavor.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using aggregation_state_ct = bb::stdlib::recursion::aggregation_state<bn254>;

aggregation_state_ct agg_points_from_witness_indicies(Builder& builder,
                                                      const AggregationObjectIndices& obj_witness_indices)
{
    std::array<bn254::BaseField, 4> aggregation_elements;
    for (size_t i = 0; i < 4; ++i) {
        aggregation_elements[i] =
            bn254::BaseField(field_ct::from_witness_index(&builder, obj_witness_indices[4 * i]),
                             field_ct::from_witness_index(&builder, obj_witness_indices[4 * i + 1]),
                             field_ct::from_witness_index(&builder, obj_witness_indices[4 * i + 2]),
                             field_ct::from_witness_index(&builder, obj_witness_indices[4 * i + 3]));
        aggregation_elements[i].assert_is_in_field();
    }

    return { bn254::Group(aggregation_elements[0], aggregation_elements[1]),
             bn254::Group(aggregation_elements[2], aggregation_elements[3]),
             true };
}

/**
 * @brief Add constraints required to recursively verify an UltraHonk proof
 *
 * @param builder
 * @param input
 * @param input_aggregation_object. The aggregation object coming from previous Honk recursion constraints.
 * @param nested_aggregation_object. The aggregation object coming from the inner proof.
 * @param has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 *
 * @note We currently only support HonkRecursionConstraint where inner_proof_contains_recursive_proof = false.
 *       We would either need a separate ACIR opcode where inner_proof_contains_recursive_proof = true,
 *       or we need non-witness data to be provided as metadata in the ACIR opcode
 */
AggregationObjectIndices create_honk_recursion_constraints(Builder& builder,
                                                           const HonkRecursionConstraint& input,
                                                           AggregationObjectIndices input_aggregation_object,
                                                           bool has_valid_witness_assignments)
{
    using Flavor = UltraRecursiveFlavor_<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<Flavor>;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1059): Handle aggregation

    // static_cast<void>(input_aggregation_object);
    // Construct aggregation points from the nested aggregation witness indices

    // Construct an in-circuit representation of the verification key.
    // For now, the v-key is a circuit constant and is fixed for the circuit.
    // (We may need a separate recursion opcode for this to vary, or add more config witnesses to this opcode)

    // If we have previously recursively verified proofs, `previous_aggregation_object_nonzero = true`
    // For now this is a complile-time constant i.e. whether this is true/false is fixed for the circuit!
    // bool previous_aggregation_indices_all_zero = true;
    // for (const auto& idx : aggregation_input) {
    //     previous_aggregation_indices_all_zero &= (idx == 0);
    // }

    // // Aggregate the aggregation object if it exists. It exists if we have previously verified proofs, i.e. if this
    // is
    // // not the first recursion constraint.
    // if (!previous_aggregation_indices_all_zero) {
    //     std::array<bn254::Group, 2> inner_agg_points = agg_points_from_witness_indicies(builder, aggregation_input);
    //     // If we have a previous aggregation object, aggregate it into the current aggregation object.
    //     // TODO(https://github.com/AztecProtocol/barretenberg/issues/995): Verify that using challenge and challenge
    //     // squared is safe.
    //     cur_aggregation_object.P0 += inner_agg_points[0] * recursion_separator;
    //     cur_aggregation_object.P1 += inner_agg_points[1] * recursion_separator;
    //     recursion_separator =
    //         recursion_separator *
    //         recursion_separator; // update the challenge to be challenge squared for the next aggregation
    // }

    std::vector<field_ct> key_fields;
    key_fields.reserve(input.key.size());
    for (const auto& idx : input.key) {
        auto field = field_ct::from_witness_index(&builder, idx);
        key_fields.emplace_back(field);
    }

    std::vector<field_ct> proof_fields;
    // Insert the public inputs in the middle the proof fields after 'inner_public_input_offset' because this is how the
    // core barretenberg library processes proofs (with the public inputs starting at the third element and not
    // separate from the rest of the proof)
    proof_fields.reserve(input.proof.size() + input.public_inputs.size());
    size_t i = 0;
    for (const auto& idx : input.proof) {
        auto field = field_ct::from_witness_index(&builder, idx);
        proof_fields.emplace_back(field);
        i++;
        if (i == HonkRecursionConstraint::inner_public_input_offset) {
            for (const auto& idx : input.public_inputs) {
                auto field = field_ct::from_witness_index(&builder, idx);
                proof_fields.emplace_back(field);
            }
        }
    }

    if (!has_valid_witness_assignments) {
        // Set vkey->circuit_size correctly based on the proof size
        size_t num_frs_comm = bb::field_conversion::calc_num_bn254_frs<UltraFlavor::Commitment>();
        size_t num_frs_fr = bb::field_conversion::calc_num_bn254_frs<UltraFlavor::FF>();
        assert((input.proof.size() - HonkRecursionConstraint::inner_public_input_offset -
                UltraFlavor::NUM_WITNESS_ENTITIES * num_frs_comm - UltraFlavor::NUM_ALL_ENTITIES * num_frs_fr -
                2 * num_frs_comm) %
                   (num_frs_comm + num_frs_fr * UltraFlavor::BATCHED_RELATION_PARTIAL_LENGTH) ==
               0);
        // Note: this computation should always result in log_circuit_size = CONST_PROOF_SIZE_LOG_N
        auto log_circuit_size = (input.proof.size() - HonkRecursionConstraint::inner_public_input_offset -
                                 UltraFlavor::NUM_WITNESS_ENTITIES * num_frs_comm -
                                 UltraFlavor::NUM_ALL_ENTITIES * num_frs_fr - 2 * num_frs_comm) /
                                (num_frs_comm + num_frs_fr * UltraFlavor::BATCHED_RELATION_PARTIAL_LENGTH);
        builder.assert_equal(builder.add_variable(1 << log_circuit_size), key_fields[0].witness_index);
        builder.assert_equal(builder.add_variable(input.public_inputs.size()), key_fields[1].witness_index);
        builder.assert_equal(builder.add_variable(UltraFlavor::has_zero_row ? 1 : 0), key_fields[2].witness_index);
        builder.assert_equal(builder.add_variable(0), key_fields[4].witness_index);
        uint32_t offset = 4;
        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): These are pairing points extracted
        // from a valid proof. This is a workaround because we can't represent the point at infinity in biggroup
        // yet.
        fq x0("0x031e97a575e9d05a107acb64952ecab75c020998797da7842ab5d6d1986846cf");
        fq y0("0x178cbf4206471d722669117f9758a4c410db10a01750aebb5666547acf8bd5a4");

        fq x1("0x0f94656a2ca489889939f81e9c74027fd51009034b3357f0e91b8a11e7842c38");
        fq y1("0x1b52c2020d7464a0c80c0da527a08193fe27776f50224bd6fb128b46c1ddb67f");
        std::vector<fq> aggregation_object_fq_values = { x0, y0, x1, y1 };
        for (fq val : aggregation_object_fq_values) {
            const uint256_t x = val;
            std::array<fr, fq_ct::NUM_LIMBS> val_limbs = { x.slice(0, fq_ct::NUM_LIMB_BITS),
                                                           x.slice(fq_ct::NUM_LIMB_BITS, fq_ct::NUM_LIMB_BITS * 2),
                                                           x.slice(fq_ct::NUM_LIMB_BITS * 2, fq_ct::NUM_LIMB_BITS * 3),
                                                           x.slice(fq_ct::NUM_LIMB_BITS * 3,
                                                                   stdlib::field_conversion::TOTAL_BITS) };
            for (size_t i = 0; i < fq_ct::NUM_LIMBS; ++i) {
                uint32_t idx = builder.add_variable(val_limbs[i]);
                builder.assert_equal(idx, key_fields[offset].witness_index);
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

        offset = HonkRecursionConstraint::inner_public_input_offset;
        // first 3 things
        builder.assert_equal(builder.add_variable(1 << log_circuit_size), proof_fields[0].witness_index);
        builder.assert_equal(builder.add_variable(input.public_inputs.size()), proof_fields[1].witness_index);
        builder.assert_equal(builder.add_variable(UltraFlavor::has_zero_row ? 1 : 0), proof_fields[2].witness_index);

        // the public inputs
        for (size_t i = 0; i < input.public_inputs.size(); i++) {
            builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
            offset++;
        }

        // first 7 commitments
        for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; i++) {
            auto comm = curve::BN254::AffineElement::one() * fr::random_element();
            auto frs = field_conversion::convert_to_bn254_frs(comm);
            builder.assert_equal(builder.add_variable(frs[0]), proof_fields[offset].witness_index);
            builder.assert_equal(builder.add_variable(frs[1]), proof_fields[offset + 1].witness_index);
            builder.assert_equal(builder.add_variable(frs[2]), proof_fields[offset + 2].witness_index);
            builder.assert_equal(builder.add_variable(frs[3]), proof_fields[offset + 3].witness_index);
            offset += 4;
        }

        // now the univariates, which can just be 0s (7*CONST_PROOF_SIZE_LOG_N Frs)
        for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH; i++) {
            builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
            offset++;
        }

        // now the sumcheck evalutions, which is just 43 0s
        for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; i++) {
            builder.assert_equal(builder.add_variable(fr::random_element()), proof_fields[offset].witness_index);
            offset++;
        }

        // now the zeromorph commitments, which are CONST_PROOF_SIZE_LOG_N comms
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
        ASSERT(offset == input.proof.size() + input.public_inputs.size());
    }
    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(builder, key_fields);
    RecursiveVerifier verifier(&builder, vkey);
    aggregation_state_ct input_agg_obj = agg_points_from_witness_indicies(builder, input_aggregation_object);
    aggregation_state_ct output_agg_object = verifier.verify_proof(proof_fields, input_agg_obj);

    AggregationObjectIndices proof_witness_indices = {
        output_agg_object.P0.x.binary_basis_limbs[0].element.normalize().witness_index,
        output_agg_object.P0.x.binary_basis_limbs[1].element.normalize().witness_index,
        output_agg_object.P0.x.binary_basis_limbs[2].element.normalize().witness_index,
        output_agg_object.P0.x.binary_basis_limbs[3].element.normalize().witness_index,
        output_agg_object.P0.y.binary_basis_limbs[0].element.normalize().witness_index,
        output_agg_object.P0.y.binary_basis_limbs[1].element.normalize().witness_index,
        output_agg_object.P0.y.binary_basis_limbs[2].element.normalize().witness_index,
        output_agg_object.P0.y.binary_basis_limbs[3].element.normalize().witness_index,
        output_agg_object.P1.x.binary_basis_limbs[0].element.normalize().witness_index,
        output_agg_object.P1.x.binary_basis_limbs[1].element.normalize().witness_index,
        output_agg_object.P1.x.binary_basis_limbs[2].element.normalize().witness_index,
        output_agg_object.P1.x.binary_basis_limbs[3].element.normalize().witness_index,
        output_agg_object.P1.y.binary_basis_limbs[0].element.normalize().witness_index,
        output_agg_object.P1.y.binary_basis_limbs[1].element.normalize().witness_index,
        output_agg_object.P1.y.binary_basis_limbs[2].element.normalize().witness_index,
        output_agg_object.P1.y.binary_basis_limbs[3].element.normalize().witness_index,
    };
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/996): investigate whether assert_equal on public inputs
    // is important, like what the plonk recursion constraint does.

    return proof_witness_indices;
}

} // namespace acir_format
