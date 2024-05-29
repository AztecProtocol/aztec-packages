#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief For benchmarking, we want to be sure that our mocking functions create circuits of a known size. We control
 * this, to the degree that matters for proof construction time, using these "pinning tests" that fix values.
 *
 */
class MegaMockCircuitsPinning : public ::testing::Test {
  protected:
    using ProverInstance = ProverInstance_<MegaFlavor>;
    static void SetUpTestSuite() { srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(MegaMockCircuitsPinning, FunctionSizes)
{
    const auto run_test = [](bool large) {
        GoblinProver goblin;
        MegaCircuitBuilder app_circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_function_circuit(app_circuit, large);
        auto instance = std::make_shared<ProverInstance>(app_circuit);
        if (large) {
            EXPECT_EQ(instance->proving_key.log_circuit_size, 19);
        } else {
            EXPECT_EQ(instance->proving_key.log_circuit_size, 17);
        };
    };
    run_test(true);
    run_test(false);
}

TEST_F(MegaMockCircuitsPinning, RecursionKernelSizes)
{
    const auto run_test = [](bool large) {
        {
            GoblinProver goblin;
            GoblinAccumulationOutput kernel_accum;
            MegaCircuitBuilder app_circuit{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_function_circuit(app_circuit, large);
            auto function_accum = goblin.accumulate(app_circuit);
            MegaCircuitBuilder kernel_circuit{ goblin.op_queue };
            GoblinMockCircuits::construct_mock_recursion_kernel_circuit(
                kernel_circuit,
                { function_accum.proof, function_accum.verification_key },
                { kernel_accum.proof, kernel_accum.verification_key });

            auto instance = std::make_shared<ProverInstance>(kernel_circuit);
            if (large) {
                EXPECT_EQ(instance->proving_key.log_circuit_size, 17);
            } else {
                EXPECT_EQ(instance->proving_key.log_circuit_size, 17);
            };
        }
    };
    run_test(true);
    run_test(false);
}