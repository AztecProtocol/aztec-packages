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
    using OuterDeciderProvingKey = DeciderProvingKey_<OuterFlavor>;

    using Commitment = MergeVerifier::Commitment;
    using RecursiveCommitment = GoblinRecursiveVerifier::MergeVerifier::Commitment;
    using RecursiveMergeVerificationData = GoblinRecursiveVerifier::MergeVerifier::MergeVerificationData;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ProverOutput {
        Builder builder;
        GoblinProof proof;
        Goblin::VerificationKey verifier_input;
        RecursiveMergeVerificationData recursive_merge_verification_data;
    };

    /**
     * @brief Create a goblin proof and the VM verification keys needed by the goblin recursive verifier
     *
     * @return ProverOutput
     */
    static ProverOutput create_goblin_prover_output(const size_t NUM_CIRCUITS = 3)
    {
        Goblin goblin;
        // Construct and accumulate multiple circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS - 1; ++idx) {
            MegaCircuitBuilder builder{ goblin.op_queue };
            GoblinMockCircuits::construct_simple_circuit(builder);
            goblin.prove_merge();
        }

        auto goblin_transcript = std::make_shared<Goblin::Transcript>();

        Goblin goblin_final;
        goblin_final.op_queue = goblin.op_queue;
        MegaCircuitBuilder builder{ goblin_final.op_queue };
        builder.queue_ecc_no_op();
        GoblinMockCircuits::construct_simple_circuit(builder);

        Builder outer_builder;

        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        RecursiveMergeVerificationData recursive_merge_verification_data;
        auto t_current = goblin_final.op_queue->construct_current_ultra_ops_subtable_columns();
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin_final.op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            recursive_merge_verification_data.t_commitments[idx] =
                RecursiveCommitment::from_witness(&outer_builder, pcs_commitment_key.commit(t_current[idx]));
        }

        // Output is a goblin proof plus ECCVM/Translator verification keys
        return { outer_builder,
                 goblin_final.prove(),
                 { std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() },
                 recursive_merge_verification_data };
    }
};

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(BoomerangGoblinRecursiveVerifierTests, graph_description_basic)
{
    auto [builder, proof, verifier_input, recursive_merge_verification_data] = create_goblin_prover_output();

    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    GoblinRecursiveVerifierOutput output = verifier.verify(proof, recursive_merge_verification_data);
    output.points_accumulator.set_public();
    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->get_precomputed());
        OuterProver prover(proving_key, verification_key);
        OuterVerifier verifier(verification_key);
        auto proof = prover.construct_proof();
        bool verified = verifier.verify_proof(proof);

        ASSERT(verified);
    }
    auto translator_pairing_points = output.points_accumulator;
    translator_pairing_points.P0.x.fix_witness();
    translator_pairing_points.P0.y.fix_witness();
    translator_pairing_points.P1.x.fix_witness();
    translator_pairing_points.P1.y.fix_witness();
    info("Recursive Verifier: num gates = ", builder.num_gates);
    auto graph = cdg::StaticAnalyzer(builder, false);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    EXPECT_EQ(variables_in_one_gate.size(), 0);
}

} // namespace bb::stdlib::recursion::honk
