// === AUDIT STATUS ===
// internal:    { status: Completed, auditors: [Federico], commit: }
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
    [[maybe_unused]] const std::shared_ptr<Chonk>& ivc_base,
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
                create_honk_recursion_constraints<UltraZKRecursiveFlavor_<MegaCircuitBuilder>,
                                                  stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(builder,
                                                                                                          constraint);
        } else if (constraint.proof_type == HONK) {
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraRecursiveFlavor_<MegaCircuitBuilder>,
                                                  stdlib::recursion::honk::DefaultIO<MegaCircuitBuilder>>(builder,
                                                                                                          constraint);
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
    [[maybe_unused]] const std::shared_ptr<Chonk>& ivc_base,
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
                create_honk_recursion_constraints<UltraZKRecursiveFlavor_<UltraCircuitBuilder>,
                                                  stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(builder,
                                                                                                           constraint);
        } else if (constraint.proof_type == HONK) {
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                                  stdlib::recursion::honk::DefaultIO<UltraCircuitBuilder>>(builder,
                                                                                                           constraint);
        } else if (constraint.proof_type == ROLLUP_HONK || constraint.proof_type == ROOT_ROLLUP_HONK) {
            // Use UltraRecursiveFlavor with RollupIO for rollup proofs (IO determines IPA handling)
            honk_recursion_constraint =
                create_honk_recursion_constraints<UltraRecursiveFlavor_<UltraCircuitBuilder>,
                                                  stdlib::recursion::honk::RollupIO>(builder, constraint);
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
    BB_ASSERT(
        !(output.is_root_rollup && output.nested_ipa_claims.size() + output.nested_triple_ipa_openings.size() != 2),
        "Root rollup must accumulate two IPA proofs.");

    for (const auto& [constraint, opcode_idx] : zip_view(chonk_recursion_data.first, chonk_recursion_data.second)) {
        ChonkRecursionConstraintOutput chonk_output = create_chonk_recursion_constraints(builder, constraint);

        output.update_triple_ipa_opening(chonk_output.points_accumulator, std::move(chonk_output.triple_ipa_opening));

        gate_counter.track_diff(gates_per_opcode, opcode_idx);
    }

    for (const auto& [constraint, opcode_idx] : zip_view(avm_recursion_data.first, avm_recursion_data.second)) {
        AvmRecursionConstraintOutput avm_output = create_avm2_recursion_constraints_goblin(builder, constraint);

        output.update_triple_ipa_opening(avm_output.points_accumulator, std::move(avm_output.triple_ipa_opening));

        gate_counter.track_diff(gates_per_opcode, opcode_idx);
    }

    return output;
}

void process_hn_recursion_constraints(
    MegaCircuitBuilder& builder,
    GateCounter<MegaCircuitBuilder>& gate_counter,
    std::vector<size_t>& gates_per_opcode,
    const std::pair<std::vector<RecursionConstraint>, std::vector<size_t>>& hn_recursion_data,
    const std::shared_ptr<Chonk>& ivc_base)
{
    using StdlibFF = Chonk::StdlibFF;
    using AppStdlibVK = Chonk::AppRecursiveFlavor::VerificationKey;
    using AppStdlibVKAndHash = Chonk::AppRecursiveVKAndHash;
    using KernelStdlibVK = Chonk::KernelRecursiveFlavor::VerificationKey;
    using KernelStdlibVKAndHash = Chonk::KernelRecursiveVKAndHash;

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
            for (auto [constraint, queue_entry] : zip_view(hn_recursion_data.first, ivc->verification_queue)) {
                auto key_fields = fields_from_witnesses(builder, constraint.key);
                populate_fields(builder, key_fields, queue_entry.vk_to_field_elements());
                builder.set_variable(constraint.key_hash, queue_entry.vk_hash());
            }
        }

        std::vector<bb::StdlibCircuitVKAndHash> stdlib_vk_and_hashs;
        stdlib_vk_and_hashs.reserve(hn_recursion_data.first.size());
        for (auto [constraint, queue_entry] : zip_view(hn_recursion_data.first, ivc->verification_queue)) {
            auto hash = StdlibFF::from_witness_index(&builder, constraint.key_hash);
            if (queue_entry.is_kernel()) {
                stdlib_vk_and_hashs.emplace_back(std::make_shared<KernelStdlibVKAndHash>(
                    std::make_shared<KernelStdlibVK>(KernelStdlibVK::from_witness_indices(builder, constraint.key)),
                    hash));
            } else {
                stdlib_vk_and_hashs.emplace_back(std::make_shared<AppStdlibVKAndHash>(
                    std::make_shared<AppStdlibVK>(AppStdlibVK::from_witness_indices(builder, constraint.key)), hash));
            }
        }
        // Create stdlib representations of each {proof, vkey} pair to be recursively verified
        ivc->instantiate_stdlib_verification_queue(builder, stdlib_vk_and_hashs);

        // Verify stdlib queue size matches after instantiation (invariant check)
        BB_ASSERT_EQ(ivc->stdlib_verification_queue.size(),
                     hn_recursion_data.first.size(),
                     "process_hn_recursion_constraints: stdlib_verification_queue size mismatch after instantiation");

        // Validate constraints against stdlib verification queue entries
        size_t group_index = 0;
        for (auto [constraint, queue_entry] : zip_view(hn_recursion_data.first, ivc->stdlib_verification_queue)) {
            // Cross-check the ACIR proof_type and the queued proof's kind against the type/kind implied by the
            // IVC's circuit kinds and the entry's position in the kernel's group. The IVC's circuit kinds (not
            // the proof_type) drive the verification logic; this is defense-in-depth that the two agree.
            BB_ASSERT_EQ(
                static_cast<PROOF_TYPE>(constraint.proof_type),
                expected_proof_type(*ivc, group_index),
                "process_hn_recursion_constraints: ACIR proof_type disagrees with circuit-kinds-derived state");
            BB_ASSERT_EQ(
                queue_entry.kind,
                expected_group_entry_kind(*ivc, group_index),
                "process_hn_recursion_constraints: queue entry kind disagrees with circuit-kinds-derived position");

            // HN recursion constraints from Noir always have empty public_inputs - the public inputs are handled
            // entirely by the IVC (KernelIO/AppIO). If this changes in the future, we need to implement binding
            // between ACIR public inputs and proof public inputs.
            BB_ASSERT(constraint.public_inputs.empty(),
                      "process_hn_recursion_constraints: unexpected non-empty public_inputs in HN constraint - "
                      "Noir HN constraints should have empty public_inputs (public inputs are handled by IVC IO)");

            // Validate public input layout: IO region size must match VK's num_public_inputs.
            const size_t expected_io_size = bb::dispatch_kind(
                queue_entry.kind, [&]<bb::CircuitKind K>() -> size_t { return bb::io_for<K>::PUBLIC_INPUTS_SIZE; });
            const size_t vk_num_public_inputs = queue_entry.vk_num_public_inputs();
            BB_ASSERT_EQ(expected_io_size,
                         vk_num_public_inputs,
                         "process_hn_recursion_constraints: IO size mismatch with VK num_public_inputs");

            // Sanity check: the proof vector stores public inputs at its start, so it must have at
            // least num_public_inputs elements.
            BB_ASSERT_GTE(queue_entry.proof.size(),
                          vk_num_public_inputs,
                          "process_hn_recursion_constraints: proof vector smaller than num_public_inputs - malformed "
                          "proof");
            ++group_index;
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
        process_with_ivc(create_mock_chonk_from_constraints(hn_recursion_data.first));
    } else {
        process_with_ivc(ivc_base);
    }
}

} // namespace acir_format
