#include "barretenberg/boomerang_value_detection/graph.hpp"
#include "barretenberg/circuit_checker/circuit_checker.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/stdlib/goblin_verifier/goblin_recursive_verifier.hpp"
#include "barretenberg/stdlib/honk_verifier/ultra_verification_keys_comparator.hpp"
#include "barretenberg/stdlib_circuit_builders/mock_circuits.hpp"
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

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    static MegaCircuitBuilder construct_mock_circuit(std::shared_ptr<ECCOpQueue> op_queue)
    {
        MegaCircuitBuilder circuit{ op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, /*target_log2_dyadic_size=*/8);
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    struct ProverOutput {
        GoblinProof proof;
        Goblin::VerificationKey verfier_input;
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
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto circuit = construct_mock_circuit(goblin.op_queue);
            goblin.prove_merge();
        }

        // Output is a goblin proof plus ECCVM/Translator verification keys
        return { goblin.prove(), { std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() } };
    }
};

/**
 * @brief Construct and check a goblin recursive verification circuit
 *
 */
TEST_F(BoomerangGoblinRecursiveVerifierTests, graph_description_basic)
{
    auto [proof, verifier_input] = create_goblin_prover_output();
    Builder builder;
    GoblinRecursiveVerifier verifier{ &builder, verifier_input };
    auto [translator_pairing_points, opening_claim, ipa_transcript] = verifier.verify(proof);
    auto G_commitment = opening_claim.commitment;
    G_commitment.x.fix_witness(); // need to check after full test run
    G_commitment.y.fix_witness(); // need to check after full test run
    EXPECT_EQ(builder.failed(), false) << builder.err();
    /*     {
            auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
            OuterProver prover(proving_key);
            auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
            OuterVerifier verifier(verification_key);
            auto proof = prover.construct_proof();
            bool verified = verifier.verify_proof(proof);

            ASSERT(verified);
        } */
    builder.finalize_circuit(false);
    info("Recursive Verifier: num gates = ", builder.num_gates);
    auto graph = cdg::Graph(builder, false);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    if (variables_in_one_gate.empty()) {
        info("variables in one gate is empty");
    } else {
        auto first_var = std::vector<uint32_t>(variables_in_one_gate.begin(), variables_in_one_gate.end())[4];
        info("first var == ", first_var);
        graph.print_variable_in_one_gate(builder, first_var);
    }
    // auto connected_components = graph.find_connected_components();
    // info("number of connected components == ", connected_components.size());
}

} // namespace bb::stdlib::recursion::honk