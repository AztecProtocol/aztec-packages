#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/common/test.hpp"

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/goblin/merge_prover.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::stdlib::recursion::honk {
class BoomerangGoblinRecursiveVerifierTests : public testing::Test {
  public:
    using Builder = UltraCircuitBuilder;
    using ECCVMVK = Goblin::ECCVMVerificationKey;
    using TranslatorVK = Goblin::TranslatorVerificationKey;

    using Commitment = MergeVerifier::Commitment;
    using MergeCommitments = MergeVerifier::InputCommitments;
    using RecursiveCommitment = GoblinRecursiveVerifier::MergeVerifier::Commitment;
    using RecursiveMergeCommitments = GoblinRecursiveVerifier::MergeVerifier::InputCommitments;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    template <typename TripleIpaClaim> static void fix_triple_ipa_claim_witnesses(TripleIpaClaim& claim)
    {
        claim.unshifted_commitment.fix_witness();
        claim.shifted_commitment.fix_witness();
        claim.unshifted_evaluation.fix_witness();
        claim.shifted_evaluation.fix_witness();
        claim.univariate.commitment.fix_witness();
        claim.univariate.opening_pair.challenge.fix_witness();
        claim.univariate.opening_pair.evaluation.fix_witness();
        for (auto& challenge : claim.multilinear_challenge) {
            challenge.fix_witness();
        }
    }

    struct ProverOutput {
        GoblinProof proof;
        Goblin::VerificationKey verifier_input;
        MergeCommitments merge_commitments;
    };

    /**
     * @brief Create a goblin proof and the VM verification keys needed by the goblin recursive verifier
     *
     * @return ProverOutput
     */
    static ProverOutput create_goblin_prover_output()
    {
        Goblin goblin;
        GoblinMockCircuits::construct_and_merge_mock_circuits(goblin, 5);
        goblin.op_queue->construct_zk_columns();

        // Merge the ecc ops from the newly constructed circuit
        auto goblin_proof = goblin.prove();
        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        MergeCommitments merge_commitments;
        auto t_current = goblin.op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = goblin.op_queue->construct_table_columns_up_to_tail();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows() +
                                                       UltraEccOpsTable::ZK_ULTRA_OPS);
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            merge_commitments.t_commitments[idx] = pcs_commitment_key.commit(t_current[idx]);
            merge_commitments.T_prev_commitments[idx] = pcs_commitment_key.commit(T_prev[idx]);
        }

        // Output is a goblin proof plus ECCVM/Translator verification keys
        return { goblin_proof, { std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() }, merge_commitments };
    }
};

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(BoomerangGoblinRecursiveVerifierTests, graph_description_basic)
{
    auto [proof, verifier_input, merge_commitments] = create_goblin_prover_output();

    Builder builder;

    // Merge commitments
    RecursiveMergeCommitments recursive_merge_commitments;
    for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
        recursive_merge_commitments.t_commitments[idx] =
            RecursiveCommitment::from_witness(&builder, merge_commitments.t_commitments[idx]);
        recursive_merge_commitments.T_prev_commitments[idx] =
            RecursiveCommitment::from_witness(&builder, merge_commitments.T_prev_commitments[idx]);
        recursive_merge_commitments.t_commitments[idx].unset_free_witness_tag();
        recursive_merge_commitments.T_prev_commitments[idx].unset_free_witness_tag();
    }

    auto transcript = std::make_shared<GoblinRecursiveVerifier::Transcript>();
    GoblinStdlibProof stdlib_proof(builder, proof);
    GoblinRecursiveVerifier verifier{ transcript, stdlib_proof, recursive_merge_commitments };
    GoblinRecursiveVerifier::ReductionResult output = verifier.reduce_to_pairing_check_and_triple_ipa_opening();

    // Aggregate merge + translator pairing points
    output.translator_pairing_points.aggregate(output.merge_pairing_points);

    fix_triple_ipa_claim_witnesses(output.triple_ipa_opening.claim);

    auto [ipa_claim, ipa_proof] = IPA<stdlib::grumpkin<Builder>>::create_random_valid_ipa_claim_and_proof(builder);

    stdlib::recursion::honk::RollupIO inputs;
    inputs.pairing_inputs = output.translator_pairing_points;
    inputs.ipa_claim = ipa_claim;
    inputs.set_public();
    builder.ipa_proof = ipa_proof;

    // Use the already aggregated pairing points (merge + translator)
    auto translator_pairing_points = output.translator_pairing_points;

    // The pairing points are public outputs from the recursive verifier that will be verified externally via a pairing
    // check. While they are computed within the circuit (via batch_mul for P0 and negation for P1), their output
    // coordinates may not appear in multiple constraint gates. Calling fix_witness() adds explicit constraints on these
    // values. Without these constraints, the StaticAnalyzer detects 20 variables (the coordinate limbs) that appear in
    // only one gate. This ensures the pairing point coordinates are properly constrained within the circuit itself,
    // rather than relying solely on them being public outputs.
    translator_pairing_points.fix_witness();

    builder.finalize_circuit();
    EXPECT_FALSE(builder.failed()) << builder.err();

    info("Recursive Verifier: num gates = ", builder.num_gates());
    auto graph = cdg::StaticAnalyzer(builder, false);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

} // namespace bb::stdlib::recursion::honk
