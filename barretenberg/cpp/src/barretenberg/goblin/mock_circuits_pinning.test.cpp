#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/proof_system/circuit_builder/goblin_ultra_circuit_builder.hpp"
#include "barretenberg/ultra_honk/ultra_composer.hpp"
#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief For benchmarking, we want to be sure that our mocking functions create circuits of a known size. We control
 * this, to the degree that matters for proof construction time, using these "pinning tests" that fix values.
 *
 */
class MockCircuits : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(MockCircuits, PinFunctionSizes)
{
    const auto run_test = [](bool large) {
        Goblin goblin;
        GoblinUltraCircuitBuilder app_circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_function_circuit(app_circuit, large);
        GoblinUltraComposer composer;
        auto instance = composer.create_instance(app_circuit);
        if (large) {
            EXPECT_EQ(instance->proving_key->log_circuit_size, 19);
        } else {
            EXPECT_EQ(instance->proving_key->log_circuit_size, 17);
        };
    };
    run_test(true);
    run_test(false);
}

TEST_F(MockCircuits, PinRecursionKernelSizes)
{
    const auto run_test = [](bool large) {
        {
            Goblin goblin;
            GoblinMockCircuits::perform_op_queue_interactions_for_mock_first_circuit(goblin.op_queue);
            Goblin::AccumulationOutput kernel_accum;
            GoblinUltraCircuitBuilder app_circuit{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(app_circuit, large);
            auto function_accum = goblin.accumulate(app_circuit);
            GoblinUltraCircuitBuilder kernel_circuit{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_recursion_kernel_circuit(kernel_circuit, function_accum, kernel_accum);
            GoblinUltraComposer composer;
            auto instance = composer.create_instance(kernel_circuit);
            if (large) {
                EXPECT_EQ(instance->proving_key->log_circuit_size, 17);
            } else {
                EXPECT_EQ(instance->proving_key->log_circuit_size, 17);
            };
        }
    };
    run_test(true);
    run_test(false);
}

TEST_F(MockCircuits, PinFoldingKernelSizes)
{
    ClientIVC ivc;

    // Accumulate three circuits to generate two folding proofs for input to folding kernel
    GoblinUltraCircuitBuilder circuit_1{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_1);
    ivc.initialize(circuit_1);

    GoblinUltraCircuitBuilder circuit_2{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_2);
    auto fold_proof_1 = ivc.accumulate(circuit_2);

    GoblinUltraCircuitBuilder circuit_3{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_function_circuit(circuit_3);
    auto fold_proof_2 = ivc.accumulate(circuit_3);

    // Construct kernel circuit
    GoblinUltraCircuitBuilder kernel_circuit{ ivc.goblin.op_queue };
    GoblinMockCircuits::construct_mock_folding_kernel(kernel_circuit, fold_proof_1, fold_proof_2);
    GoblinUltraComposer composer;
    auto instance = composer.create_instance(kernel_circuit);
    EXPECT_EQ(instance->proving_key->log_circuit_size, 17);
}