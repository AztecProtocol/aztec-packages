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

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

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
        auto merge_proof = goblin_final.prove_final_merge();

        // Output is a goblin proof plus ECCVM/Translator verification keys
        return { goblin_final.prove(merge_proof), { std::make_shared<ECCVMVK>(), std::make_shared<TranslatorVK>() } };
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
    GoblinRecursiveVerifierOutput output = verifier.verify(proof);
    output.points_accumulator.set_public();
    // Construct and verify a proof for the Goblin Recursive Verifier circuit
    {
        auto proving_key = std::make_shared<OuterDeciderProvingKey>(builder);
        OuterProver prover(proving_key);
        auto verification_key = std::make_shared<typename OuterFlavor::VerificationKey>(proving_key->proving_key);
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
    auto graph = cdg::Graph(builder, false);
    auto variables_in_one_gate = graph.show_variables_in_one_gate(builder);
    if (variables_in_one_gate.empty()) {
        info("variables in one gate is empty");
    } else {
        info("size of variables in one gate == ", variables_in_one_gate.size());
        auto first_var = std::vector<uint32_t>(variables_in_one_gate.begin(), variables_in_one_gate.end())[1];
        info("first var == ", first_var);
        graph.print_variable_in_one_gate(builder, first_var);
    }
    // auto connected_components = graph.find_connected_components();
    // info("number of connected components == ", connected_components.size());
}

} // namespace bb::stdlib::recursion::honk