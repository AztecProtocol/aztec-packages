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
#include "barretenberg/dsl/acir_format/utils.hpp"

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

    // Schema invariants: validate constraint type combinations for MegaBuilder
    BB_ASSERT(!(has_honk_recursion_constraints && has_hn_recursion_constraints),
              "create_recursion_constraints: invalid circuit - both honk and HN recursion constraints present");
    BB_ASSERT(
        !has_avm_recursion_constraints,
        "create_recursion_constraints: invalid circuit - AVM recursion constraints not supported with MegaBuilder");
    BB_ASSERT(!has_chonk_recursion_constraints,
              "create_recursion_constraints: invalid circuit - Chonk recursion constraints not supported with "
              "MegaBuilder");

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

    // Schema invariants: validate constraint type combinations for UltraBuilder
    BB_ASSERT(
        !has_hn_recursion_constraints,
        "create_recursion_constraints: invalid circuit - HN recursion constraints not supported with UltraBuilder");
    BB_ASSERT(!(has_chonk_recursion_constraints && has_honk_recursion_constraints),
              "create_recursion_constraints: invalid circuit - both honk and chonk recursion constraints present");
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

    // Validate hn_recursion_data constraints/indices size match
    BB_ASSERT_EQ(hn_recursion_data.first.size(),
                 hn_recursion_data.second.size(),
                 "process_hn_recursion_constraints: hn_recursion_data constraints/indices size mismatch");

    // Lambda template to handle both Chonk and Chonk with the same code
    auto process_with_ivc = [&]<typename IVCType>(const std::shared_ptr<IVCType>& ivc) {
        // We expect the length of the internal verification queue to match the number of ivc recursion constraints
        BB_ASSERT_EQ(hn_recursion_data.first.size(),
                     ivc->verification_queue.size(),
                     "process_hn_recursion_constraints: mismatch in number of recursive verifications during kernel "
                     "creation!");

        // If no witness is provided, populate the VK and public inputs in the recursion constraint with dummy values so
        // that the present kernel circuit is constructed correctly. (Used for constructing VKs without witnesses).
        if (builder.is_write_vk_mode()) {
            // Create stdlib representations of each {proof, vkey} pair to be recursively verified
            for (auto [constraint, queue_entry] : zip_view(hn_recursion_data.first, ivc->verification_queue)) {
                auto key_fields = fields_from_witnesses(builder, constraint.key);
                populate_fields(builder, key_fields, queue_entry.honk_vk->to_field_elements());
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

        // Verify stdlib queue size matches after instantiation (invariant check)
        BB_ASSERT_EQ(ivc->stdlib_verification_queue.size(),
                     hn_recursion_data.first.size(),
                     "process_hn_recursion_constraints: stdlib_verification_queue size mismatch after instantiation");

        // Validate constraints against stdlib verification queue entries
        for (auto [constraint, queue_entry] : zip_view(hn_recursion_data.first, ivc->stdlib_verification_queue)) {
            // Validate ACIR constraint proof_type matches IVC queue type
            BB_ASSERT(proof_type_to_chonk_queue_type(constraint.proof_type) == queue_entry.type,
                      "process_hn_recursion_constraints: ACIR constraint proof_type does not match IVC queue type");

            // HN recursion constraints from Noir always have empty public_inputs - the public inputs are handled
            // entirely by the IVC (KernelIO/AppIO). If this changes in the future, we need to implement binding
            // between ACIR public inputs and proof public inputs.
            BB_ASSERT(constraint.public_inputs.empty(),
                      "process_hn_recursion_constraints: unexpected non-empty public_inputs in HN constraint - "
                      "Noir HN constraints should have empty public_inputs (public inputs are handled by IVC IO)");

            // Validate public input layout: IO region size must match VK's num_public_inputs
            size_t expected_io_size =
                queue_entry.is_kernel ? IVCType::KernelIO::PUBLIC_INPUTS_SIZE : IVCType::AppIO::PUBLIC_INPUTS_SIZE;
            size_t vk_num_public_inputs =
                static_cast<size_t>(uint64_t(queue_entry.honk_vk_and_hash->vk->num_public_inputs.get_value()));
            BB_ASSERT_EQ(expected_io_size,
                         vk_num_public_inputs,
                         "process_hn_recursion_constraints: IO size mismatch with VK num_public_inputs");

            // Sanity check: proof vector should have at least num_public_inputs elements
            // (HN proofs store public inputs at the start of the proof vector)
            BB_ASSERT_GTE(queue_entry.proof.size(),
                          vk_num_public_inputs,
                          "process_hn_recursion_constraints: proof vector smaller than num_public_inputs - malformed "
                          "proof");
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
        auto chonk = std::dynamic_pointer_cast<Chonk>(ivc_base);
        BB_ASSERT(chonk != nullptr, "process_hn_recursion_constraints: ivc_base is not a Chonk instance");
        process_with_ivc(chonk);
    }
}

} // namespace acir_format
