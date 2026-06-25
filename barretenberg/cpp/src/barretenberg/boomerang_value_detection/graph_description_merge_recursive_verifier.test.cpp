#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/merge_verifier.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib/primitives/curves/bn254.hpp"

using namespace cdg;

namespace bb::stdlib::recursion::goblin {

/**
 * @brief Test suite for recursive verification of Goblin Merge proofs
 * @details The recursive verification circuit is arithmetized using Goblin-style Ultra arithmetization
 * (MegaCircuitBuilder).
 *
 * @tparam Builder
 */
template <class RecursiveBuilder> class BoomerangRecursiveMergeVerifierTest : public testing::Test {

    // Types for recursive verifier circuit
    using RecursiveMergeVerifier = MergeRecursiveVerifier<RecursiveBuilder>;
    using RecursiveTableCommitments = MergeRecursiveVerifier<RecursiveBuilder>::TableCommitments;
    using RecursiveMergeCommitments = MergeRecursiveVerifier<RecursiveBuilder>::InputCommitments;

    // Define types relevant for inner circuit
    using InnerFlavor = MegaFlavor;
    using InnerProverInstance = ProverInstance_<InnerFlavor>;
    using InnerBuilder = typename InnerFlavor::CircuitBuilder;

    // Define additional types for testing purposes
    using Commitment = InnerFlavor::Commitment;
    using FF = InnerFlavor::FF;
    using VerifierCommitmentKey = bb::VerifierCommitmentKey<curve::BN254>;
    using MergeProof = MergeProver::MergeProof;
    using TableCommitments = MergeVerifier::TableCommitments;
    using MergeCommitments = MergeVerifier::InputCommitments;

  public:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static void analyze_circuit(RecursiveBuilder& outer_circuit)
    {
        auto tool = StaticAnalyzer_<bb::fr, RecursiveBuilder>(outer_circuit);
        auto result = tool.analyze_circuit();
        EXPECT_EQ(result.first.size(), 1);
        EXPECT_EQ(result.second.size(), 0);
        tool.fill_witness_duplicate_map({}, cdg::WitnessDuplicateFilterMode::TRIAGE_VALUE_FILTERS);
        EXPECT_TRUE(tool.get_witness_duplicate_map().empty());
    }

    static std::shared_ptr<ECCOpQueue> construct_final_merge_op_queue(const size_t num_subtables_up_to_tail)
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        for (size_t idx = 0; idx < num_subtables_up_to_tail; ++idx) {
            InnerBuilder circuit{ op_queue };
            GoblinMockCircuits::construct_simple_circuit(circuit);
            op_queue->merge();
        }

        op_queue->construct_zk_columns();

        InnerBuilder hiding_circuit{ op_queue };
        GoblinMockCircuits::construct_simple_circuit(hiding_circuit);
        return op_queue;
    }

    static void prove_and_verify_merge(const std::shared_ptr<ECCOpQueue>& op_queue, const bool run_analyzer = false)

    {
        RecursiveBuilder outer_circuit;

        auto prover_transcript = std::make_shared<NativeTranscript>();
        MergeProver merge_prover{ op_queue, prover_transcript };
        auto merge_proof = merge_prover.construct_proof();

        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        MergeCommitments merge_commitments;
        RecursiveMergeCommitments recursive_merge_commitments;
        auto t_current = op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = op_queue->construct_table_columns_up_to_tail();
        for (size_t idx = 0; idx < InnerFlavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = merge_prover.pcs_commitment_key.commit(t_current[idx]);
            merge_commitments.T_prev_commitments[idx] = merge_prover.pcs_commitment_key.commit(T_prev[idx]);
            recursive_merge_commitments.t_commitments[idx] =
                RecursiveMergeVerifier::Commitment::from_witness(&outer_circuit, merge_commitments.t_commitments[idx]);
            recursive_merge_commitments.T_prev_commitments[idx] = RecursiveMergeVerifier::Commitment::from_witness(
                &outer_circuit, merge_commitments.T_prev_commitments[idx]);
            // Removing the free witness tag, since the merge commitments in the full scheme are supposed to
            // be fiat-shamirred earlier
            recursive_merge_commitments.t_commitments[idx].unset_free_witness_tag();
            recursive_merge_commitments.T_prev_commitments[idx].unset_free_witness_tag();
        }

        // Create a recursive merge verification circuit for the merge proof
        auto merge_transcript = std::make_shared<StdlibTranscript<RecursiveBuilder>>();
        RecursiveMergeVerifier verifier{ merge_transcript };
        const stdlib::Proof<RecursiveBuilder> stdlib_merge_proof(outer_circuit, merge_proof);
        auto [pairing_points, merged_commitments, reduction_succeeded] =
            verifier.reduce_to_pairing_check(stdlib_merge_proof, recursive_merge_commitments);

        // The pairing points are public outputs from the recursive verifier that will be verified externally via a
        // pairing check. Their output coordinate limbs (from goblin batch_mul's queue_ecc_eq) may only appear in a
        // single ECC op gate. Calling fix_witness() adds explicit constraints on these values so the StaticAnalyzer
        // does not flag them as under-constrained.
        pairing_points.fix_witness();

        // Check for a failure flag in the recursive verifier circuit
        EXPECT_FALSE(outer_circuit.failed());
        if (run_analyzer) {
            analyze_circuit(outer_circuit);
        }
    }

    static void test_recursive_merge_verification()
    {
        auto op_queue = construct_final_merge_op_queue(/*num_subtables_up_to_tail=*/3);
        prove_and_verify_merge(op_queue, /*run_analyzer=*/true);
    }
};

using Builder = testing::Types<MegaCircuitBuilder>;

TYPED_TEST_SUITE(BoomerangRecursiveMergeVerifierTest, Builder);

TYPED_TEST(BoomerangRecursiveMergeVerifierTest, RecursiveMergeVerification)
{
    TestFixture::test_recursive_merge_verification();
};

} // namespace bb::stdlib::recursion::goblin
