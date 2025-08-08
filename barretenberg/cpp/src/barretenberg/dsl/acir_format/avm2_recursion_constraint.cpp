// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#ifndef DISABLE_AZTEC_VM

#include "avm2_recursion_constraint.hpp"

#include "barretenberg/constants.hpp"
#include "barretenberg/dsl/acir_format/avm2_recursion_constraint_mock.hpp"
#include "barretenberg/dsl/acir_format/proof_surgeon.hpp"
#include "barretenberg/flavor/flavor.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/stdlib/pairing_points.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/constraining/recursion/goblin_avm_recursive_verifier.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_flavor.hpp"
#include "barretenberg/vm2/constraining/recursion/recursive_verifier.hpp"

#include <cstddef>

namespace acir_format {

using namespace bb;
using field_ct = stdlib::field_t<Builder>;
using bn254 = stdlib::bn254<Builder>;
using PairingPoints = bb::stdlib::recursion::PairingPoints<Builder>;

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

    auto fields_from_witnesses = [&](const std::vector<uint32_t>& input) {
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

    // Populate the key fields and proof fields with dummy values to prevent issues (e.g. points must be on curve).
    if (!has_valid_witness_assignments) {
        create_dummy_vkey_and_proof(builder, input.proof.size(), input.public_inputs.size(), key_fields, proof_fields);
    }

    // Execute the Goblin AVM2 recursive verifier
    RecursiveVerifier verifier(builder, key_fields);

    bb::avm2::AvmGoblinRecursiveVerifier::RecursiveAvmGoblinOutput output =
        verifier.verify_proof(proof_fields, bb::avm2::PublicInputs::flat_to_columns(public_inputs_flattened));

    return output;
}

} // namespace acir_format
#endif // DISABLE_AZTEC_VM
