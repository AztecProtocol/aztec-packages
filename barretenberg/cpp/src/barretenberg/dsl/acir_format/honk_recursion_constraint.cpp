// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "honk_recursion_constraint.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_recursive_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_recursive_flavor.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_recursive_verifier.hpp"
#include "barretenberg/stdlib/primitives/bigfield/constants.hpp"
#include "barretenberg/stdlib/primitives/circuit_builders/circuit_builders_fwd.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/stdlib/primitives/pairing_points.hpp"
#include "barretenberg/stdlib/proof/proof.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
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
    using IO = std::conditional_t<HasIPAAccumulator<Flavor>,
                                  stdlib::recursion::honk::RollupIO,
                                  stdlib::recursion::honk::DefaultIO<Builder>>;

    // Set vkey->circuit_size correctly based on the proof size
    BB_ASSERT_EQ(proof_size, NativeFlavor::PROOF_LENGTH_WITHOUT_PUB_INPUTS());

    size_t num_inner_public_inputs = public_inputs_size - IO::PUBLIC_INPUTS_SIZE;
    uint32_t pub_inputs_offset = NativeFlavor::has_zero_row ? 1 : 0;

    // Generate mock honk vk
    auto honk_vk = create_mock_honk_vk<typename Flavor::NativeFlavor, IO>(
        1 << Flavor::VIRTUAL_LOG_N, pub_inputs_offset, num_inner_public_inputs);

    size_t offset = 0;

    // Set honk vk in builder
    for (auto& vk_element : honk_vk->to_field_elements()) {
        builder.set_variable(key_fields[offset].witness_index, vk_element);
        offset++;
    }

    // Generate dummy honk proof
    bb::HonkProof honk_proof = create_mock_honk_proof<typename Flavor::NativeFlavor, IO>(num_inner_public_inputs);

    offset = 0;
    // Set honk proof in builder
    for (auto& proof_element : honk_proof) {
        builder.set_variable(proof_fields[offset].witness_index, proof_element);
        offset++;
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
    requires(IsRecursiveFlavor<Flavor> && IsUltraHonk<typename Flavor::NativeFlavor>)
{
    using Builder = typename Flavor::CircuitBuilder;
    using RecursiveVerificationKey = Flavor::VerificationKey;
    using RecursiveVKAndHash = Flavor::VKAndHash;
    using RecursiveVerifier = bb::stdlib::recursion::honk::UltraRecursiveVerifier_<Flavor>;
    using IO = std::conditional_t<HasIPAAccumulator<Flavor>,
                                  stdlib::recursion::honk::RollupIO,
                                  stdlib::recursion::honk::DefaultIO<Builder>>;

    ASSERT(input.proof_type == HONK || input.proof_type == HONK_ZK || HasIPAAccumulator<Flavor>);
    BB_ASSERT_EQ(input.proof_type == ROLLUP_HONK || input.proof_type == ROOT_ROLLUP_HONK, HasIPAAccumulator<Flavor>);

    // Construct an in-circuit representation of the verification key.
    // For now, the v-key is a circuit constant and is fixed for the circuit.
    // (We may need a separate recursion opcode for this to vary, or add more config witnesses to this opcode)
    std::vector<field_ct<Builder>> key_fields = RecursionConstraint::fields_from_witnesses(builder, input.key);

    // Create circuit type for vkey hash.
    auto vk_hash = field_ct<Builder>::from_witness_index(&builder, input.key_hash);

    // Create witness indices for the proof with public inputs reinserted
    std::vector<uint32_t> proof_indices =
        ProofSurgeon<uint256_t>::create_indices_for_reconstructed_proof(input.proof, input.public_inputs);
    stdlib::Proof<Builder> proof_fields = RecursionConstraint::fields_from_witnesses(builder, proof_indices);

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        // In the constraint, the agg object public inputs are still contained in the proof. To get the 'raw' size of
        // the proof and public_inputs we subtract and add the corresponding amount from the respective sizes.
        size_t size_of_proof_with_no_pub_inputs = input.proof.size() - IO::PUBLIC_INPUTS_SIZE;
        size_t total_num_public_inputs = input.public_inputs.size() + IO::PUBLIC_INPUTS_SIZE;

        create_dummy_vkey_and_proof<Flavor>(
            builder, size_of_proof_with_no_pub_inputs, total_num_public_inputs, key_fields, proof_fields);
    }

    // Recursively verify the proof
    auto vkey = std::make_shared<RecursiveVerificationKey>(key_fields);
    auto vk_and_hash = std::make_shared<RecursiveVKAndHash>(vkey, vk_hash);
    RecursiveVerifier verifier(&builder, vk_and_hash);
    UltraRecursiveVerifierOutput<Builder> verifier_output = verifier.template verify_proof<IO>(proof_fields);
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
