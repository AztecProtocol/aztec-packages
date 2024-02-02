#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/proof_system/circuit_builder/ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"

#include <gtest/gtest.h>
using namespace bb;
using namespace bb::honk;

class GoblinFoldingTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Curve = curve::BN254;
    using FF = Curve::ScalarField;
    using GoblinUltraBuilder = GoblinUltraCircuitBuilder;
    using KernelInput = Goblin::AccumulationOutput;
    using GUHFlavor = flavor::GoblinUltra;
    using Instance = ProverInstance_<GUHFlavor>;
    using FoldingOutput = FoldingResult<GUHFlavor>;

    static GoblinUltraBuilder create_function_circuit(auto& op_queue)
    {
        GoblinUltraCircuitBuilder function_circuit{ op_queue };
        GoblinMockCircuits::construct_arithmetic_circuit(function_circuit, 1 << 8);
        GoblinMockCircuits::construct_goblin_ecc_op_circuit(function_circuit);
        return function_circuit;
    }

    static FoldingOutput construct_folding_accumulator(GoblinUltraBuilder& builder,
                                                       const std::shared_ptr<Instance>& accumulator)
    {
        GoblinUltraComposer composer;
        auto instance = composer.create_instance(builder);
        std::vector<std::shared_ptr<Instance>> instances{ accumulator, instance };
        auto folding_prover = composer.create_folding_prover(instances);
        return folding_prover.fold_instances();
    }
};

/**
 * @brief A full Goblin test that mimicks the basic aztec client architecture
 * @details
 */
TEST_F(GoblinFoldingTests, Folding)
{
    Goblin goblin;

    Goblin::AccumulationOutput kernel_accum;

    // TODO(https://github.com/AztecProtocol/barretenberg/issues/723):
    GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);

    // Perform "Round 0"
    auto function_circuit = create_function_circuit(goblin.op_queue);
    auto kernel_circuit = create_function_circuit(goblin.op_queue);

    GoblinUltraComposer composer;
    auto fctn_instance = composer.create_instance(function_circuit);
    auto kernel_instance = composer.create_instance(kernel_circuit);
    std::vector<std::shared_ptr<Instance>> instances{ fctn_instance, kernel_instance };
    auto folding_prover = composer.create_folding_prover(instances);
    auto folding_output = folding_prover.fold_instances();
    auto fold_proof = folding_output.folding_data;
    std::shared_ptr<Instance> accum_instance{ folding_output.accumulator };
    auto folding_verifier = composer.create_folding_verifier();
    auto folding_verified = folding_verifier.verify_folding_proof(fold_proof);
    EXPECT_TRUE(folding_verified);

    // size_t NUM_CIRCUITS = 2;
    // for (size_t circuit_idx = 0; circuit_idx < NUM_CIRCUITS; ++circuit_idx) {

    //     // Construct and accumulate a mock function circuit
    //     auto function_circuit = create_function_circuit(goblin.op_queue);
    //     info("function merge");
    //     goblin.merge(function_circuit);
    //     // WORKTODO
    //     auto function_accum = construct_folding_accumulator(function_circuit);

    //     // Construct and accumulate the mock kernel circuit (no kernel accum in first round)
    //     GoblinUltraCircuitBuilder kernel_circuit{ goblin.op_queue };
    //     // WORKTODO
    //     // GoblinMockCircuits::construct_mock_folding_kernel(kernel_circuit, function_accum, kernel_accum);
    //     info("kernel accum");
    //     goblin.merge(kernel_circuit);
    //     // WORKTODO
    //     // kernel_accum = construct_folding_accumulator(kernel_circuit);
    // }

    // // WORKTODO: do we need to execute the decider prover here? Should this happen instead of the last folding accum?

    // info("goblin prove");
    // Goblin::Proof proof = goblin.prove();
    // // WORKTODO: Execute the decider verifier
    // // Verify the goblin proof (eccvm, translator, merge)
    // info("goblin verify");
    // bool verified = goblin.verify(proof);
    // EXPECT_TRUE(verified);
    // // WORKTODO: check decider result as well
    // // EXPECT_TRUE(ultra_verified && verified);
}