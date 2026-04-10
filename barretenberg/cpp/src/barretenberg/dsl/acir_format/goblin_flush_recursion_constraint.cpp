#include "goblin_flush_recursion_constraint.hpp"

#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/dsl/acir_format/mock_verifier_inputs.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/goblin_without_merge/goblin_without_merge.hpp"
#include "barretenberg/goblin_without_merge/goblin_without_merge_verifier.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"

namespace acir_format {

using namespace bb;
using namespace bb::stdlib::recursion::honk;

namespace {

/**
 * @brief Generate a real Goblin proof from mock circuits for testing/VK generation
 */
std::pair<GoblinWithoutMergeProof, MergeVerifier::TableCommitments> create_mock_goblin_proof_and_commitments()
{
    // Generate OP_QUEUE and populate it with some operations
    auto op_queue = std::make_shared<ECCOpQueue>();
    MegaCircuitBuilder builder(op_queue);

    builder.queue_ecc_no_op();
    builder.queue_ecc_no_op();
    builder.queue_ecc_no_op();
    builder.queue_ecc_no_op();
    builder.queue_ecc_eq();
    builder.queue_ecc_add_accum(bb::g1::affine_element::one());

    // Use GoblinWithoutMerge with the accumulated op queue
    op_queue->merge();
    GoblinWithoutMerge flush_goblin(op_queue, /*is_zk=*/false);
    auto flush_proof = flush_goblin.prove();

    // Extract merge commitments from op_queue
    typename MergeVerifier::TableCommitments table_commitments;
    auto merged_table = op_queue->construct_ultra_ops_table_columns();
    CommitmentKey<curve::BN254> pcs_commitment_key(op_queue->get_ultra_ops_table_num_rows());
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        table_commitments[idx] = pcs_commitment_key.commit(merged_table[idx]);
    }

    return { flush_proof, table_commitments };
}

} // anonymous namespace

HonkRecursionConstraintOutput<MegaCircuitBuilder> create_goblin_flush_recursion_constraints(
    MegaCircuitBuilder& builder,
    const RecursionConstraint& input,
    [[maybe_unused]] const std::shared_ptr<IVCBase>& ivc_base)
{
    using Builder = MegaCircuitBuilder;
    using Curve = stdlib::bn254<Builder>;
    using RecursiveCommitment = Curve::AffineElement;
    using MegaGoblinVerifier = GoblinWithoutMergeRecursiveVerifier_<Builder>;
    using RecursiveTableCommitments = MegaGoblinVerifier::TableCommitments;
    using Transcript = StdlibTranscript<Builder>;

    BB_ASSERT(input.proof_type == ULTRA_GOBLIN,
              "create_goblin_flush_recursion_constraints: expected ULTRA_GOBLIN proof type");

    GoblinWithoutMergeProof flush_proof;
    MergeVerifier::TableCommitments merged_table;

    // Step 1: Generate or extract the Goblin proof and table commitments
    if (builder.is_write_vk_mode()) {
        std::tie(flush_proof, merged_table) = create_mock_goblin_proof_and_commitments();
    } else {
        Goblin goblin = ivc_base->get_goblin();

        // Get the UltraOpsTable from the ivc
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
        auto merged_poly = goblin.op_queue->construct_ultra_ops_table_columns();

        for (auto [table, poly] : zip_view(merged_table, merged_poly)) {
            table = pcs_commitment_key.commit(poly);
        }

        // Prove goblin without merge, with IS_ZK = false (flush proof is never exposed externally)
        // NOTE: The following code cannot be executed in parallel with other code that requires access to the is_zk
        // flag of the op queue. This is because we modify the is_zk flag for proving and then we restore it afterwards.
        GoblinWithoutMerge flush_goblin(goblin.op_queue, /*is_zk=*/false);
        flush_proof = flush_goblin.prove();
    }

    // Step 2: Directly verify ECCVM + Translator inside the Mega circuit (no inner Ultra circuit needed)
    GoblinWithoutMergeStdlibProof_<Builder> stdlib_proof(builder, flush_proof);

    // Convert native table commitments to recursive (stdlib) commitments
    RecursiveTableCommitments recursive_merged_table;
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        recursive_merged_table[idx] = RecursiveCommitment::from_witness(&builder, merged_table[idx]);
        recursive_merged_table[idx].unset_free_witness_tag();
    }

    auto transcript = std::make_shared<Transcript>();
    MegaGoblinVerifier verifier{ transcript, stdlib_proof, recursive_merged_table };
    auto result = verifier.reduce_to_pairing_check_and_ipa_opening();

    // Step 3: Package the result into the expected output format
    HonkRecursionConstraintOutput<Builder> output;
    output.points_accumulator = std::move(result.translator_pairing_points);
    output.ipa_claim = std::move(result.ipa_claim);
    output.ipa_proof = std::move(result.ipa_proof);
    output.merged_table = std::move(recursive_merged_table);

    vinfo("Goblin flush recursion constraint: direct ECCVM+Translator verification in Mega circuit");

    return output;
}

} // namespace acir_format
