// === AUDIT STATUS ===
// internal:    { status: Planned, auditors: [], commit: }
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#include "barretenberg/dsl/acir_format/recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/avm2_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/chonk_recursion_constraints.hpp"
#include "barretenberg/dsl/acir_format/honk_recursion_constraint.hpp"
#include "barretenberg/dsl/acir_format/hypernova_recursion_constraint.hpp"

namespace acir_format {

template <>
HonkRecursionConstraintsOutput<MegaCircuitBuilder> create_recursion_constraints(
    MegaCircuitBuilder& builder,
    GateCounter<MegaCircuitBuilder>& gate_counter,
    std::vector<size_t>& gates_per_opcode,
    [[maybe_unused]] const std::shared_ptr<IVCBase>& ivc_base,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& honk_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& avm_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& hn_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& chonk_recursion_data)
{
    bool has_honk_recursion_constraints = !honk_recursion_data.first.empty();
    bool has_avm_recursion_constraints = !avm_recursion_data.first.empty();
    bool has_hn_recursion_constraints = !hn_recursion_data.first.empty();
    bool has_chonk_recursion_constraints = !chonk_recursion_data.first.empty();

    // We shouldn't have both honk recursion constraints and HN recursion constraints.
    BB_ASSERT(!has_honk_recursion_constraints || !has_hn_recursion_constraints,
              "Invalid circuit: both honk and ivc recursion constraints present.");
    // AVM constraints are not handled when using MegaBuilder
    BB_ASSERT(!has_avm_recursion_constraints,
              "Invalid circuit: avm recursion constraints are not supported with MegaBuilder.");

    // Chonk constraints are not handled when using MegaBuilder
    BB_ASSERT(!has_chonk_recursion_constraints,
              "Invalid circuit: chonk recursion constraints are not supported with MegaBuilder.");
    HonkRecursionConstraintsOutput<MegaCircuitBuilder> output;

    for (const auto& [constraint, opcode_idx] : zip_view(honk_recursion_data.first, honk_recursion_data.second)) {
        HonkRecursionConstraintOutput<MegaCircuitBuilder> honk_recursion_constraint;

        if (constraint.proof_type == HONK_ZK) {
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraZKRecursiveFlavor_<MegaCircuitBuilder>>(builder, constraint);
        } else if (constraint.proof_type == HONK) {
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraRecursiveFlavor_<MegaCircuitBuilder>>(builder, constraint);
        } else if (constraint.proof_type == ROLLUP_HONK || constraint.proof_type == ROOT_ROLLUP_HONK) {
            bb::assert_failure("Rollup Honk proof type not supported on MegaBuilder");
        } else {
            bb::assert_failure("Invalid Honk proof type");
        }

        output.update(honk_recursion_constraint, /*update_ipa_data=*/false); // Update output
        gate_counter.track_diff(gates_per_opcode, opcode_idx);               // Track gate count
    }

    if (has_hn_recursion_constraints) {
        process_hn_recursion_constraints(builder, gate_counter, gates_per_opcode, hn_recursion_data, ivc_base);
    }

    return output;
}

template <>
HonkRecursionConstraintsOutput<UltraCircuitBuilder> create_recursion_constraints(
    UltraCircuitBuilder& builder,
    GateCounter<UltraCircuitBuilder>& gate_counter,
    std::vector<size_t>& gates_per_opcode,
    [[maybe_unused]] const std::shared_ptr<IVCBase>& ivc_base,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& honk_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& avm_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& hn_recursion_data,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& chonk_recursion_data)
{
    bool has_honk_recursion_constraints = !honk_recursion_data.first.empty();
    bool has_avm_recursion_constraints = !avm_recursion_data.first.empty();
    bool has_hn_recursion_constraints = !hn_recursion_data.first.empty();
    bool has_chonk_recursion_constraints = !chonk_recursion_data.first.empty();

    BB_ASSERT(!has_hn_recursion_constraints,
              "Invalid circuit: HN recursion constraints are present with UltraBuilder.");
    BB_ASSERT(!(has_chonk_recursion_constraints && has_honk_recursion_constraints),
              "Invalid circuit: both honk and chonk recursion constraints are present.");
    if (has_chonk_recursion_constraints && has_avm_recursion_constraints) {
        vinfo("WARNING: both chonk and avm recursion constraints are present. While we support this combination, we "
              "expect to see it only in a mock circuit.");
    }

    HonkRecursionConstraintsOutput<UltraCircuitBuilder> output;

    for (const auto& [constraint, opcode_idx] : zip_view(honk_recursion_data.first, honk_recursion_data.second)) {
        HonkRecursionConstraintOutput<UltraCircuitBuilder> honk_recursion_constraint;

        if (constraint.proof_type == HONK_ZK) {
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraZKRecursiveFlavor_<UltraCircuitBuilder>>(builder, constraint);
        } else if (constraint.proof_type == HONK) {
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraRecursiveFlavor_<UltraCircuitBuilder>>(builder, constraint);
        } else if (constraint.proof_type == ROLLUP_HONK || constraint.proof_type == ROOT_ROLLUP_HONK) {
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraRollupRecursiveFlavor_<UltraCircuitBuilder>>(builder,
                                                                                                    constraint);
        } else {
            bb::assert_failure("Invalid Honk proof type");
        }

        // Update output
        output.update(honk_recursion_constraint,
                      /*update_ipa_data=*/constraint.proof_type == ROLLUP_HONK ||
                          constraint.proof_type == ROOT_ROLLUP_HONK);
        output.is_root_rollup = constraint.proof_type == ROOT_ROLLUP_HONK;

        gate_counter.track_diff(gates_per_opcode, opcode_idx);
    }
    BB_ASSERT(!(output.is_root_rollup && output.nested_ipa_claims.size() != 2),
              "Root rollup must accumulate two IPA proofs.");

    for (const auto& [constraint, opcode_idx] : zip_view(chonk_recursion_data.first, chonk_recursion_data.second)) {
        HonkRecursionConstraintOutput<UltraCircuitBuilder> honk_output =
            create_chonk_recursion_constraints(builder, constraint);

        // Update the output
        output.update(honk_output, /*update_ipa_data=*/true);

        gate_counter.track_diff(gates_per_opcode, opcode_idx);
    }

    for (const auto& [constraint, opcode_idx] : zip_view(avm_recursion_data.first, avm_recursion_data.second)) {
        HonkRecursionConstraintOutput<UltraCircuitBuilder> honk_output =
            create_avm2_recursion_constraints_goblin(builder, constraint);

        // Update the output
        output.update(honk_output, /*update_ipa_data=*/true);

        gate_counter.track_diff(gates_per_opcode, opcode_idx);
    }

    return output;
}

void process_hn_recursion_constraints(
    MegaCircuitBuilder& builder,
    GateCounter<MegaCircuitBuilder>& gate_counter,
    std::vector<size_t>& gates_per_opcode,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& hn_recursion_data,
    const std::shared_ptr<IVCBase>& ivc_base)
{
    using StdlibVerificationKey = Chonk::RecursiveVerificationKey;
    using StdlibVKAndHash = Chonk::RecursiveVKAndHash;
    using StdlibFF = Chonk::RecursiveFlavor::FF;

    // Lambda template to handle both Chonk and Chonk with the same code
    auto process_with_ivc = [&]<typename IVCType>(const std::shared_ptr<IVCType>& ivc) {
        // We expect the length of the internal verification queue to match the number of ivc recursion constraints
        BB_ASSERT_EQ(hn_recursion_data.first.size(),
                     ivc->verification_queue.size(),
                     "WARNING: Mismatch in number of recursive verifications during kernel creation!");

        // If no witness is provided, populate the VK and public inputs in the recursion constraint with dummy values so
        // that the present kernel circuit is constructed correctly. (Used for constructing VKs without witnesses).
        if (builder.is_write_vk_mode()) {
            // Create stdlib representations of each {proof, vkey} pair to be recursively verified
            for (auto [constraint, queue_entry] : zip_view(hn_recursion_data.first, ivc->verification_queue)) {
                populate_dummy_vk_in_constraint(builder, queue_entry.honk_vk, constraint.key);
                builder.set_variable(constraint.key_hash, queue_entry.honk_vk->hash());
            }
        }

        // Construct a stdlib verification key for each constraint based on the verification key witness indices
        // therein
        std::vector<std::shared_ptr<StdlibVKAndHash>> stdlib_vk_and_hashs;
        stdlib_vk_and_hashs.reserve(hn_recursion_data.first.size());
        for (const auto& constraint : hn_recursion_data.first) {
            stdlib_vk_and_hashs.push_back(std::make_shared<StdlibVKAndHash>(
                std::make_shared<StdlibVerificationKey>(
                    StdlibVerificationKey::from_witness_indices(builder, constraint.key)),
                StdlibFF::from_witness_index(&builder, constraint.key_hash)));
        }
        // Create stdlib representations of each {proof, vkey} pair to be recursively verified
        ivc->instantiate_stdlib_verification_queue(builder, stdlib_vk_and_hashs);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/1597): Are there public inputs in the queue_entry
        // proofs?
        // Connect the public_input witnesses in each constraint to the corresponding public input witnesses in
        // the internal verification queue. This ensures that the witnesses utilized in constraints generated based on
        // acir are properly connected to the constraints generated herein via the ivc scheme (e.g. recursive
        // verifications).
        for (auto [constraint, queue_entry] : zip_view(hn_recursion_data.first, ivc->stdlib_verification_queue)) {
            // Validate ACIR constraint proof_type matches IVC queue type
            BB_ASSERT(proof_type_to_queue_type(constraint.proof_type) == queue_entry.type,
                      "ACIR constraint proof_type does not match IVC queue type");

            std::vector<StdlibFF> public_inputs_from_proof(queue_entry.proof.begin(),
                                                           queue_entry.proof.begin() +
                                                               static_cast<ptrdiff_t>(constraint.public_inputs.size()));

            for (const auto [proof_public_input, constraint_public_input_idx] :
                 zip_view(public_inputs_from_proof, constraint.public_inputs)) {
                const StdlibFF constraint_public_input =
                    StdlibFF::from_witness_index(&builder, constraint_public_input_idx);
                proof_public_input.assert_equal(constraint_public_input);
            }
        }

        // Complete the kernel circuit with all required recursive verifications, databus consistency checks etc.
        ivc->complete_kernel_circuit_logic(builder);

        // Note: we can't easily track the gate contribution from each individual hn_recursion_constraint since they
        // are handled simultaneously in the above function call; instead we track the total contribution
        gate_counter.track_diff(gates_per_opcode, hn_recursion_data.second.at(0));
    };

    // If an ivc instance is not provided, we mock one with the state required to construct the recursion
    // constraints present in the program. This is for when we write_vk.
    if (ivc_base == nullptr) {
        auto mock_ivc = create_mock_chonk_from_constraints(hn_recursion_data.first);
        process_with_ivc(mock_ivc);
    } else {
        auto chonk = std::static_pointer_cast<Chonk>(ivc_base);
        process_with_ivc(chonk);
    }
}

} // namespace acir_format
