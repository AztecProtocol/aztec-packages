#include "honk_recursion_constraint.hpp"
#include "barretenberg/plonk/proof_system/verification_key/verification_key.hpp"
#include "barretenberg/plonk/transcript/transcript_wrappers.hpp"
#include "barretenberg/stdlib/plonk_recursion/aggregation_state/aggregation_state.hpp"
#include "barretenberg/stdlib/plonk_recursion/verifier/verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "recursion_constraint.hpp"

namespace acir_format {

using namespace bb;
using namespace bb::stdlib::recursion::honk;

/**
 * @brief Add constraints required to recursively verify an UltraPlonk proof
 *
 * @param builder
 * @param input
 * @tparam has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 * @tparam inner_proof_contains_recursive_proof. Do we expect the inner proof to also have performed recursive
 * verification? We need to know this at circuit-compile time.
 *
 * @note We currently only support HonkRecursionConstraint where inner_proof_contains_recursive_proof = false.
 *       We would either need a separate ACIR opcode where inner_proof_contains_recursive_proof = true,
 *       or we need non-witness data to be provided as metadata in the ACIR opcode
 */
std::array<uint32_t, HonkRecursionConstraint::AGGREGATION_OBJECT_SIZE> create_honk_recursion_constraints(
    Builder& builder,
    const HonkRecursionConstraint& input,
    std::array<uint32_t, HonkRecursionConstraint::AGGREGATION_OBJECT_SIZE> input_aggregation_object,
    std::array<uint32_t, HonkRecursionConstraint::AGGREGATION_OBJECT_SIZE> nested_aggregation_object,
    bool has_valid_witness_assignments)
{
    using Flavor = UltraRecursiveFlavor_<Builder>;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = UltraRecursiveVerifier_<Flavor>;

    static_cast<void>(has_valid_witness_assignments);
    static_cast<void>(nested_aggregation_object);
    // const auto& nested_aggregation_indices = nested_aggregation_object;
    // const bool inner_proof_contains_recursive_proof = true;

    // Construct an in-circuit representation of the verification key.
    // For now, the v-key is a circuit constant and is fixed for the circuit.
    // (We may need a separate recursion opcode for this to vary, or add more config witnesses to this opcode)
    const auto& aggregation_input = input_aggregation_object;
    aggregation_state_ct previous_aggregation;

    // If we have previously recursively verified proofs, `inner_aggregation_object_nonzero = true`
    // For now this is a complile-time constant i.e. whether this is true/false is fixed for the circuit!
    bool inner_aggregation_indices_all_zero = true;
    for (const auto& idx : aggregation_input) {
        inner_aggregation_indices_all_zero &= (idx == 0);
    }

    if (!inner_aggregation_indices_all_zero) {
        std::array<bn254::BaseField, 4> aggregation_elements;
        for (size_t i = 0; i < 4; ++i) {
            aggregation_elements[i] =
                bn254::BaseField(field_ct::from_witness_index(&builder, aggregation_input[4 * i]),
                                 field_ct::from_witness_index(&builder, aggregation_input[4 * i + 1]),
                                 field_ct::from_witness_index(&builder, aggregation_input[4 * i + 2]),
                                 field_ct::from_witness_index(&builder, aggregation_input[4 * i + 3]));
            aggregation_elements[i].assert_is_in_field();
        }
        // If we have a previous aggregation object, assign it to `previous_aggregation` so that it is included
        // in stdlib::recursion::verify_proof
        previous_aggregation.P0 = bn254::Group(aggregation_elements[0], aggregation_elements[1]);
        previous_aggregation.P1 = bn254::Group(aggregation_elements[2], aggregation_elements[3]);
        previous_aggregation.has_data = true;
    } else {
        previous_aggregation.has_data = false;
    }

    std::vector<field_ct> key_fields;
    key_fields.reserve(input.key.size());
    for (const auto& idx : input.key) {
        auto field = field_ct::from_witness_index(&builder, idx);
        key_fields.emplace_back(field);
    }

    std::vector<field_ct> proof_fields;
    // Prepend the public inputs to the proof fields because this is how the
    // core barretenberg library processes proofs (with the public inputs first and not separated)
    proof_fields.reserve(input.proof.size() + input.public_inputs.size());
    for (const auto& idx : input.public_inputs) {
        auto field = field_ct::from_witness_index(&builder, idx);
        proof_fields.emplace_back(field);
    }
    for (const auto& idx : input.proof) {
        auto field = field_ct::from_witness_index(&builder, idx);
        proof_fields.emplace_back(field);
    }

    // recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(builder, key_fields);
    RecursiveVerifier verifier(&builder, vkey);
    std::array<typename Flavor::GroupElement, 2> pairing_points = verifier.verify_proof(proof_fields);

    std::vector<uint32_t> proof_witness_indices = {
        pairing_points[0].x.binary_basis_limbs[0].element.normalize().witness_index,
        pairing_points[0].x.binary_basis_limbs[1].element.normalize().witness_index,
        pairing_points[0].x.binary_basis_limbs[2].element.normalize().witness_index,
        pairing_points[0].x.binary_basis_limbs[3].element.normalize().witness_index,
        pairing_points[0].y.binary_basis_limbs[0].element.normalize().witness_index,
        pairing_points[0].y.binary_basis_limbs[1].element.normalize().witness_index,
        pairing_points[0].y.binary_basis_limbs[2].element.normalize().witness_index,
        pairing_points[0].y.binary_basis_limbs[3].element.normalize().witness_index,
        pairing_points[1].x.binary_basis_limbs[0].element.normalize().witness_index,
        pairing_points[1].x.binary_basis_limbs[1].element.normalize().witness_index,
        pairing_points[1].x.binary_basis_limbs[2].element.normalize().witness_index,
        pairing_points[1].x.binary_basis_limbs[3].element.normalize().witness_index,
        pairing_points[1].y.binary_basis_limbs[0].element.normalize().witness_index,
        pairing_points[1].y.binary_basis_limbs[1].element.normalize().witness_index,
        pairing_points[1].y.binary_basis_limbs[2].element.normalize().witness_index,
        pairing_points[1].y.binary_basis_limbs[3].element.normalize().witness_index,
    };
    auto result = aggregation_state_ct{ pairing_points[0], pairing_points[1], {}, proof_witness_indices, true };

    // ASSERT(result.public_inputs.size() == input.public_inputs.size());

    // Assign the `public_input` field to the public input of the inner proof
    // for (size_t i = 0; i < input.public_inputs.size(); ++i) {
    //     result.public_inputs[i].assert_equal(field_ct::from_witness_index(&builder, input.public_inputs[i]));
    // }

    // We want to return an array, so just copy the vector into the array
    ASSERT(result.proof_witness_indices.size() == HonkRecursionConstraint::AGGREGATION_OBJECT_SIZE);
    std::array<uint32_t, HonkRecursionConstraint::AGGREGATION_OBJECT_SIZE> resulting_output_aggregation_object;
    std::copy(result.proof_witness_indices.begin(),
              result.proof_witness_indices.begin() + HonkRecursionConstraint::AGGREGATION_OBJECT_SIZE,
              resulting_output_aggregation_object.begin());

    return resulting_output_aggregation_object;
}

/**
 * @brief When recursively verifying proofs, we represent the verification key using field elements.
 *        This method exports the key formatted in the manner our recursive verifier expects.
 *        A dummy key is used when building a circuit without a valid witness assignment.
 *        We want the transcript to contain valid G1 points to prevent on-curve errors being thrown.
 *        We want a non-zero circuit size as this element will be inverted by the circuit
 *        and we do not want an "inverting 0" error thrown
 *
 * @return std::vector<bb::fr>
 */
std::vector<bb::fr> export_dummy_honk_key_in_recursion_format(const PolynomialManifest& polynomial_manifest,
                                                              const bool contains_recursive_proof)
{
    std::vector<fr> output;
    output.emplace_back(1); // domain.domain (will be inverted)
    output.emplace_back(1); // domain.root (will be inverted)
    output.emplace_back(1); // domain.generator (will be inverted)

    output.emplace_back(1); // circuit size
    output.emplace_back(1); // num public inputs

    output.emplace_back(contains_recursive_proof); // contains_recursive_proof
    for (size_t i = 0; i < HonkRecursionConstraint::AGGREGATION_OBJECT_SIZE; ++i) {
        output.emplace_back(0); // recursive_proof_public_input_indices
    }

    for (const auto& descriptor : polynomial_manifest.get()) {
        if (descriptor.source == PolynomialSource::SELECTOR || descriptor.source == PolynomialSource::PERMUTATION) {
            // the std::biggroup class creates unsatisfiable constraints when identical points are added/subtracted.
            // (when verifying zk proofs this is acceptable as we make sure verification key points are not identical.
            // And prover points should contain randomness for an honest Prover).
            // This check can also trigger a runtime error due to causing 0 to be inverted.
            // When creating dummy verification key points we must be mindful of the above and make sure that each
            // transcript point is unique.
            auto scalar = bb::fr::random_element();
            const auto element = bb::g1::affine_element(bb::g1::one * scalar);
            auto g1_as_fields = export_g1_affine_element_as_fields(element);
            output.emplace_back(g1_as_fields.x_lo);
            output.emplace_back(g1_as_fields.x_hi);
            output.emplace_back(g1_as_fields.y_lo);
            output.emplace_back(g1_as_fields.y_hi);
        }
    }

    output.emplace_back(0); // key_hash

    return output;
}

} // namespace acir_format
