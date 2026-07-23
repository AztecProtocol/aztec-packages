#pragma once

#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/dsl/acir_format/recursion_constraint_output.hpp"
#include "barretenberg/dsl/acir_format/utils.hpp"
#include "barretenberg/noir_programs_boomerang_values/recursion_constraints_helper.hpp"

namespace bb::chonk_boomerang {

struct ProductionMirrorTrace {
    std::vector<std::pair<std::string, recursion_helpers::BlockSnapshot>> boundaries;
    bool all_checks_passed = false;
};

inline ProductionMirrorTrace execute_production_mirror(UltraCircuitBuilder& builder,
                                                       const acir_format::RecursionConstraint& constraint)
{
    using Builder = UltraCircuitBuilder;
    using field_ct = stdlib::field_t<Builder>;
    using RecursiveVK = ChonkRecursiveVerifier::VK;
    using RecursiveVKAndHash = ChonkRecursiveVerifier::VKAndHash;
    using RecursiveIO = stdlib::recursion::honk::HidingKernelIO<Builder>;
    using MergeCommitments = GoblinRecursiveVerifier::MergeVerifier::InputCommitments;

    ProductionMirrorTrace trace;
    auto snapshot = [&](const std::string& name) {
        trace.boundaries.emplace_back(name, recursion_helpers::BlockSnapshot::capture(builder));
    };

    const std::vector<uint32_t> proof_indices =
        acir_format::add_public_inputs_to_proof(constraint.proof, constraint.public_inputs);
    auto key_fields = acir_format::fields_from_witnesses(builder, constraint.key);
    auto proof_fields = acir_format::fields_from_witnesses(builder, proof_indices);
    field_ct vk_hash = field_ct::from_witness_index(&builder, constraint.key_hash);
    auto recursive_vk = std::make_shared<RecursiveVK>(key_fields);
    auto vk_and_hash = std::make_shared<RecursiveVKAndHash>(recursive_vk, vk_hash);
    ChonkStdlibProof proof = ChonkStdlibProof::from_field_elements(proof_fields);

    auto transcript = std::make_shared<typename GoblinRecursiveVerifier::Transcript>();
    BatchedHonkTranslatorRecursiveVerifier batched_verifier(vk_and_hash, transcript);
    batched_verifier.set_stage_callback([&](const std::string_view stage) { snapshot(std::string(stage)); });
    snapshot("start");

    auto oink_result = batched_verifier.verify_mega_zk_oink(proof.hiding_oink_proof);
    snapshot("oink_only");

    RecursiveIO kernel_io;
    kernel_io.reconstruct_from_public(oink_result.public_inputs);
    kernel_io.kernel_return_data.incomplete_assert_equal(oink_result.kernel_calldata_commitment);
    snapshot("kernel_io_databus");

    MergeCommitments merge_commitments{ .t_commitments = oink_result.ecc_op_wires,
                                        .T_prev_commitments = kernel_io.ecc_op_tables };
    typename GoblinRecursiveVerifier::MergeVerifier merge_verifier{ transcript };
    auto merge_result = merge_verifier.reduce_to_pairing_check(proof.merge_proof, merge_commitments);
    snapshot("merge");

    typename GoblinRecursiveVerifier::ECCVMVerifier eccvm_verifier{ transcript, proof.eccvm_proof };
    auto eccvm_result = eccvm_verifier.reduce_to_triple_ipa_claim();
    const auto translator_input = eccvm_verifier.get_translator_input_data();
    snapshot("eccvm");

    auto joint_result = batched_verifier.verify(proof.joint_proof,
                                                translator_input.evaluation_challenge_x,
                                                translator_input.batching_challenge_v,
                                                translator_input.accumulated_result,
                                                merge_result.merged_commitments);

    using PairingPoints = std::decay_t<decltype(kernel_io.pairing_inputs)>;
    std::vector<PairingPoints> pairing_points;
    pairing_points.reserve(3);
    pairing_points.push_back(kernel_io.pairing_inputs);
    pairing_points.push_back(std::move(merge_result.pairing_points));
    pairing_points.push_back(std::move(joint_result.pairing_points));
    PairingPoints aggregated_pairing_points =
        PairingPoints::aggregate_multiple(pairing_points, /*handle_edge_cases=*/false);
    snapshot("output_aggregation");

    trace.all_checks_passed =
        merge_result.reduction_succeeded && eccvm_result.reduction_succeeded && joint_result.reduction_succeeded;

    acir_format::HonkRecursionConstraintsOutput<Builder> recursion_output;
    recursion_output.update_triple_ipa_opening(
        aggregated_pairing_points,
        { .claim = std::move(eccvm_result.triple_ipa_claim), .proof = std::move(proof.ipa_proof) });
    recursion_output.finalize(builder, /*is_hn_recursion_constraints=*/false, /*has_ipa_claim=*/true);
    snapshot("acir_output_finalization");

    return trace;
}

} // namespace bb::chonk_boomerang
