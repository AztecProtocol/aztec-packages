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

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    struct ProverOutput {
        GoblinProof proof;
        Goblin::VerificationKey verifier_input;
        RefArray<Commitment, MegaFlavor::NUM_WIRES> t_commitments;
    };

    /**
     * @brief Create a goblin proof and the VM verification keys needed by the goblin recursive verifier
     *
     * @return ProverOutput
     */
    static ProverOutput create_goblin_prover_output(std::array<Commitment, MegaFlavor::NUM_WIRES>& t_commitments_val,
                                                    const size_t NUM_CIRCUITS = 3)
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

        // Subtable values and commitments - needed for (Recursive)MergeVerifier
        auto t_current = goblin_final.op_queue->construct_current_ultra_ops_subtable_columns();
        std::array<Commitment*, MegaFlavor::NUM_WIRES> ptr_t_commitments;
        CommitmentKey<curve::BN254> pcs_commitment_key(goblin_final.op_queue->get_ultra_ops_table_num_rows());
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            t_commitments_val[idx] = pcs_commitment_key.commit(t_current[idx]);
            ptr_t_commitments[idx] = &t_commitments_val[idx];
        }

        RefArray<Commitment, MegaFlavor::NUM_WIRES> t_commitments(ptr_t_commitments);

        // Output is a goblin proof plus ECCVM/Translator verification keys
        return { goblin_final.prove(),
                 { std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() },
                 t_commitments };
    }

    /**
     * @brief Transform native subtable commitments into recursive subtable commitments
     *
     */
    static RefArray<RecursiveCommitment, MegaFlavor::NUM_WIRES> convert_native_t_commitments_to_stdlib(
        Builder* builder,
        std::array<RecursiveCommitment, MegaFlavor::NUM_WIRES> t_commitments_rec_val,
        const std::array<Commitment, MegaFlavor::NUM_WIRES>& t_commitments_val)
    {
        std::array<RecursiveCommitment*, MegaFlavor::NUM_WIRES> ptr_t_commitments_rec;
        for (size_t idx = 0; idx < MegaFlavor::NUM_WIRES; idx++) {
            t_commitments_rec_val[idx] = RecursiveCommitment::from_witness(builder, t_commitments_val[idx]);
            ptr_t_commitments_rec[idx] = &t_commitments_rec_val[idx];
        }

        RefArray<RecursiveCommitment, MegaFlavor::NUM_WIRES> t_commitments_rec(ptr_t_commitments_rec);

        return t_commitments_rec;
    }
};

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(BoomerangGoblinRecursiveVerifierTests, graph_description_basic)
{
    std::array<Commitment, MegaFlavor::NUM_WIRES> t_commitments_val;
    auto [proof, verifier_input, _] = create_goblin_prover_output(t_commitments_val);

    Builder builder;

    std::array<RecursiveCommitment, MegaFlavor::NUM_WIRES> t_commitments_rec_val;
    auto t_commitments = convert_native_t_commitments_to_stdlib(&builder, t_commitments_rec_val, t_commitments_val);

    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    GoblinRecursiveVerifierOutput output = verifier.verify(proof, t_commitments);
    output.points_accumulator.set_public();
    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
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
