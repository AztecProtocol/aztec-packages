// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "honk_recursion_constraint.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/honk/types/aggregation_object_type.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "proof_surgeon.hpp"
#include "recursion_constraint.hpp"

#include <cstddef>

namespace acir_format {

using namespace bb;
using namespace bb::stdlib::recursion::honk;
template <typename Builder> using field_ct = stdlib::field_t<Builder>;
template <typename Builder> using bn254 = stdlib::bn254<Builder>;
template <typename Builder> using PairingPoints = bb::stdlib::recursion::PairingPoints<Builder>;

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
void create_dummy_vkey_and_proof(typename Flavor::CircuitBuilder& builder,
                                 size_t proof_size,
                                 size_t public_inputs_size,
                                 const std::vector<field_ct<typename Flavor::CircuitBuilder>>& key_fields,
                                 const std::vector<field_ct<typename Flavor::CircuitBuilder>>& proof_fields)
    requires IsRecursiveFlavor<Flavor>
{
    using Builder = typename Flavor::CircuitBuilder;
    using NativeFlavor = typename Flavor::NativeFlavor;
    // Set vkey->circuit_size correctly based on the proof size
    BB_ASSERT_EQ(proof_size, NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS);
    // a lambda that adds dummy commitments (libra and gemini)
    auto set_dummy_commitment = [&](size_t& offset) {
        auto comm = curve::BN254::AffineElement::one() * fr::random_element();
        auto frs = field_conversion::convert_to_bn254_frs(comm);
        builder.set_variable(proof_fields[offset].witness_index, frs[0]);
        builder.set_variable(proof_fields[offset + 1].witness_index, frs[1]);
        builder.set_variable(proof_fields[offset + 2].witness_index, frs[2]);
        builder.set_variable(proof_fields[offset + 3].witness_index, frs[3]);
        offset += 4;
    };

    auto set_dummy_evaluation = [&](size_t& offset) {
        builder.set_variable(proof_fields[offset].witness_index, fr::random_element());
        offset++;
    };

    // Note: this computation should always result in log_circuit_size = CONST_PROOF_SIZE_LOG_N
    auto log_circuit_size = CONST_PROOF_SIZE_LOG_N;
    size_t offset = 0;
    // First key field is circuit size
    builder.set_variable(key_fields[offset++].witness_index, 1 << log_circuit_size);
    // Second key field is number of public inputs
    builder.set_variable(key_fields[offset++].witness_index, public_inputs_size);
    // Third key field is the pub inputs offset
    uint32_t pub_inputs_offset = NativeFlavor::has_zero_row ? 1 : 0;
    builder.set_variable(key_fields[offset++].witness_index, pub_inputs_offset);
    size_t num_inner_public_inputs = public_inputs_size - bb::PAIRING_POINTS_SIZE;
    if constexpr (HasIPAAccumulator<Flavor>) {
        num_inner_public_inputs -= bb::IPA_CLAIM_SIZE;
    }

    // We are making the assumption that the pairing point object is behind all the inner public inputs
    builder.set_variable(key_fields[offset].witness_index, num_inner_public_inputs);
    offset++;

    if constexpr (HasIPAAccumulator<Flavor>) {
        // We are making the assumption that the IPA claim is behind the inner public inputs and pairing point object
        builder.set_variable(key_fields[offset].witness_index, num_inner_public_inputs + PAIRING_POINTS_SIZE);
        offset++;
    }

    for (size_t i = 0; i < Flavor::NUM_PRECOMPUTED_ENTITIES; ++i) {
        set_dummy_commitment(offset);
    }

    offset = 0; // Reset offset for parsing proof fields

    // the inner public inputs
    for (size_t i = 0; i < num_inner_public_inputs; i++) {
        set_dummy_evaluation(offset);
    }

    // Get some values for a valid aggregation object and use them here to avoid divide by 0 or other issues.
    std::array<fr, PairingPoints<Builder>::PUBLIC_INPUTS_SIZE> dummy_pairing_points_values =
        PairingPoints<Builder>::construct_dummy();
    for (size_t i = 0; i < PairingPoints<Builder>::PUBLIC_INPUTS_SIZE; i++) {
        builder.set_variable(proof_fields[offset].witness_index, dummy_pairing_points_values[i]);
        offset++;
    }

    // IPA claim
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/1392): Don't use random elements here.
    if constexpr (HasIPAAccumulator<Flavor>) {
        for (size_t i = 0; i < bb::IPA_CLAIM_SIZE; i++) {
            set_dummy_evaluation(offset);
        }
    }

    // first NUM_WITNESS_ENTITIES witness commitments
    for (size_t i = 0; i < Flavor::NUM_WITNESS_ENTITIES; i++) {
        set_dummy_commitment(offset);
    }

    if constexpr (Flavor::HasZK) {
        // Libra concatenation commitment
        set_dummy_commitment(offset);
        // libra sum
        set_dummy_evaluation(offset);
    }

    // now the univariates, which can just be 0s (8*CONST_PROOF_SIZE_LOG_N Frs, where 8 is the maximum relation
    // degree)
    for (size_t i = 0; i < CONST_PROOF_SIZE_LOG_N * Flavor::BATCHED_RELATION_PARTIAL_LENGTH; i++) {
        set_dummy_evaluation(offset);
    }

    // now the sumcheck evaluations, which is just 44 0s
    for (size_t i = 0; i < Flavor::NUM_ALL_ENTITIES; i++) {
        set_dummy_evaluation(offset);
    }

    if constexpr (Flavor::HasZK) {
        // Libra claimed evaluation
        set_dummy_evaluation(offset);
        // Libra grand sum commitment

        set_dummy_commitment(offset);
        // Libra quotient commitment
        set_dummy_commitment(offset);
        // Gemini masking commitment
        set_dummy_commitment(offset);
        // Gemini masking evaluation
        set_dummy_evaluation(offset);
    }

    // now the gemini fold commitments which are CONST_PROOF_SIZE_LOG_N - 1
    for (size_t i = 1; i < CONST_PROOF_SIZE_LOG_N; i++) {
        set_dummy_commitment(offset);
    }

    // the gemini fold evaluations which are also CONST_PROOF_SIZE_LOG_N
    for (size_t i = 1; i <= CONST_PROOF_SIZE_LOG_N; i++) {
        set_dummy_evaluation(offset);
    }

    if constexpr (Flavor::HasZK) {
        // NUM_SMALL_IPA_EVALUATIONS libra evals
        for (size_t i = 0; i < NUM_SMALL_IPA_EVALUATIONS; i++) {
            set_dummy_evaluation(offset);
        }
    }

    // lastly the shplonk batched quotient commitment and kzg quotient commitment
    for (size_t i = 0; i < 2; i++) {
        set_dummy_commitment(offset);
    }
    // IPA Proof
    if constexpr (HasIPAAccumulator<Flavor>) {
        // Poly length
        builder.set_variable(proof_fields[offset].witness_index, fr(1));
        offset++;

        // Ls and Rs
        for (size_t i = 0; i < static_cast<size_t>(2) * CONST_ECCVM_LOG_N; i++) {
            auto comm = curve::Grumpkin::AffineElement::one() * fq::random_element();
            auto frs = field_conversion::convert_to_bn254_frs(comm);
            builder.set_variable(proof_fields[offset].witness_index, frs[0]);
            builder.set_variable(proof_fields[offset + 1].witness_index, frs[1]);
            offset += 2;
        }

        // G_zero
        auto G_zero = curve::Grumpkin::AffineElement::one() * fq::random_element();
        auto G_zero_frs = field_conversion::convert_to_bn254_frs(G_zero);
        builder.set_variable(proof_fields[offset].witness_index, G_zero_frs[0]);
        builder.set_variable(proof_fields[offset + 1].witness_index, G_zero_frs[1]);
        offset += 2;

        // a_zero
        auto a_zero = fq::random_element();
        auto a_zero_frs = field_conversion::convert_to_bn254_frs(a_zero);
        builder.set_variable(proof_fields[offset].witness_index, a_zero_frs[0]);
        builder.set_variable(proof_fields[offset + 1].witness_index, a_zero_frs[1]);
        offset += 2;
    }

    BB_ASSERT_EQ(offset, proof_size + public_inputs_size);
}
} // namespace

/**
 * @brief Add constraints required to recursively verify an UltraHonk proof
 *
 * @param builder
 * @param input
 * @param input_points_accumulator_indices. The aggregation object coming from previous Honk recursion constraints.
 * @param has_valid_witness_assignment. Do we have witnesses or are we just generating keys?
 */

template <typename Flavor>
HonkRecursionConstraintOutput<typename Flavor::CircuitBuilder> create_honk_recursion_constraints(
    typename Flavor::CircuitBuilder& builder, const RecursionConstraint& input, bool has_valid_witness_assignments)
    requires IsRecursiveFlavor<Flavor>
{
    using Builder = typename Flavor::CircuitBuilder;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<Flavor>;

    ASSERT(input.proof_type == HONK || input.proof_type == HONK_ZK || HasIPAAccumulator<Flavor>);
    ASSERT((input.proof_type == ROLLUP_HONK || input.proof_type == ROOT_ROLLUP_HONK) == HasIPAAccumulator<Flavor>);

    // Construct an in-circuit representation of the verification key.
    // For now, the v-key is a circuit constant and is fixed for the circuit.
    // (We may need a separate recursion opcode for this to vary, or add more config witnesses to this opcode)
    std::vector<field_ct<Builder>> key_fields;
    key_fields.reserve(input.key.size());
    for (const auto& idx : input.key) {
        auto field = field_ct<Builder>::from_witness_index(&builder, idx);
        key_fields.emplace_back(field);
    }

    std::vector<field_ct<Builder>> proof_fields;

    // Create witness indices for the proof with public inputs reinserted
    std::vector<uint32_t> proof_indices =
        ProofSurgeon::create_indices_for_reconstructed_proof(input.proof, input.public_inputs);
    proof_fields.reserve(proof_indices.size());
    for (const auto& idx : proof_indices) {
        auto field = field_ct<Builder>::from_witness_index(&builder, idx);
        proof_fields.emplace_back(field);
    }

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        // In the constraint, the agg object public inputs are still contained in the proof. To get the 'raw' size of
        // the proof and public_inputs we subtract and add the corresponding amount from the respective sizes.
        size_t size_of_proof_with_no_pub_inputs = input.proof.size() - bb::PAIRING_POINTS_SIZE;
        if constexpr (HasIPAAccumulator<Flavor>) {
            size_of_proof_with_no_pub_inputs -= bb::IPA_CLAIM_SIZE;
        }
        size_t total_num_public_inputs = input.public_inputs.size() + bb::PAIRING_POINTS_SIZE;
        if constexpr (HasIPAAccumulator<Flavor>) {
            total_num_public_inputs += bb::IPA_CLAIM_SIZE;
        }

        create_dummy_vkey_and_proof<Flavor>(
            builder, size_of_proof_with_no_pub_inputs, total_num_public_inputs, key_fields, proof_fields);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(builder, key_fields);
    RecursiveVerifier verifier(&builder, vkey);
    UltraRecursiveVerifierOutput<Builder> verifier_output = verifier.verify_proof(proof_fields);
    // TODO(https://github.com/AztecProtocol/barretenberg/issues/996): investigate whether assert_equal on public inputs
    // is important, like what the plonk recursion constraint does.
    return verifier_output;
}

template HonkRecursionConstraintOutput<UltraCircuitBuilder> create_honk_recursion_constraints<
    UltraRecursiveFlavor_<UltraCircuitBuilder>>(UltraCircuitBuilder& builder,
                                                const RecursionConstraint& input,
                                                bool has_valid_witness_assignments);

template HonkRecursionConstraintOutput<UltraCircuitBuilder> create_honk_recursion_constraints<
    UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>(UltraCircuitBuilder& builder,
                                                      const RecursionConstraint& input,
                                                      bool has_valid_witness_assignments);

template HonkRecursionConstraintOutput<MegaCircuitBuilder> create_honk_recursion_constraints<
    UltraRecursiveFlavor_<MegaCircuitBuilder>>(MegaCircuitBuilder& builder,
                                               const RecursionConstraint& input,
                                               bool has_valid_witness_assignments);

template HonkRecursionConstraintOutput<MegaCircuitBuilder> create_honk_recursion_constraints<
    UltraZKRecursiveFlavor_<MegaCircuitBuilder>>(MegaCircuitBuilder& builder,
                                                 const RecursionConstraint& input,
                                                 bool has_valid_witness_assignments);

template HonkRecursionConstraintOutput<UltraCircuitBuilder> create_honk_recursion_constraints<
    UltraZKRecursiveFlavor_<UltraCircuitBuilder>>(UltraCircuitBuilder& builder,
                                                  const RecursionConstraint& input,
                                                  bool has_valid_witness_assignments);

} // namespace acir_format
