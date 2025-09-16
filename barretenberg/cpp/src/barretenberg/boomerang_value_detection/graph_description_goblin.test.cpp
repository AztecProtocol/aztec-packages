#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"

#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/ultra_honk/ultra_prover.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

namespace bb::stdlib::recursion::honk {
class BoomerangGoblinRecursiveVerifierTests : public testing::Test {
  public:
    using Builder = GoblinRecursiveVerifier::Builder;
    using ECCVMVK = Goblin::ECCVMVerificationKey;
    using TranslatorVK = Goblin::TranslatorVerificationKey;

    using OuterFlavor = UltraFlavor;
    using OuterProver = UltraProver_<OuterFlavor>;
    using OuterVerifier = UltraVerifier_<OuterFlavor>;
    using OuterProverInstance = ProverInstance_<OuterFlavor>;

    using Commitment = MergeVerifier::Commitment;
    using MergeCommitments = MergeVerifier::InputCommitments;
    using RecursiveCommitment = GoblinRecursiveVerifier::MergeVerifier::Commitment;
    using RecursiveMergeCommitments = GoblinRecursiveVerifier::MergeVerifier::InputCommitments;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

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

        // Merge the ecc ops from the newly constructed circuit
        auto goblin_proof = goblin.prove(MergeSettings::APPEND);
        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        MergeCommitments merge_commitments;
        auto t_current = goblin.op_queue->construct_current_ultra_ops_subtable_columns();
        auto T_prev = goblin.op_queue->construct_previous_ultra_ops_table_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin.op_queue->get_ultra_ops_table_num_rows());
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

    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    GoblinRecursiveVerifierOutput output = verifier.verify(proof, recursive_merge_commitments, MergeSettings::APPEND);
    output.points_accumulator.set_public();
    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto prover_instance = std::make_shared<OuterProverInstance>(builder);
        auto verification_key =
            std::make_shared<typename OuterFlavor::VerificationKey>(prover_instance->get_precomputed());
        OuterProver prover(prover_instance, verification_key);
        OuterVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.template verify_proof<bb::DefaultIO>(proof).result;

        ASSERT_TRUE(verified);
    }
    auto translator_pairing_points = output.points_accumulator;
    translator_pairing_points.P0.x.fix_witness();
    translator_pairing_points.P0.y.fix_witness();
    translator_pairing_points.P1.x.fix_witness();
    translator_pairing_points.P1.y.fix_witness();
    info("Recursive Verifier: num gates = ", builder.num_gates);
    auto graph = cdg::StaticAnalyzer(builder, false);
    auto variables_in_one_gate = graph.get_variables_in_one_gate();
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

} // namespace bb::stdlib::recursion::honk
