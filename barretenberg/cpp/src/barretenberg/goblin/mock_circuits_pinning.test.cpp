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
    using DeciderProvingKey = DeciderProvingKey_<MegaFlavor>;
    static void SetUpTestSuite() { srs::init_crs_factory("../srs_db/ignition"); }
};

TEST_F(MegaMockCircuitsPinning, FunctionSizes)
{
    const auto run_test = [](bool large) {
        GoblinProver goblin;
        MegaCircuitBuilder app_circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_function_circuit(app_circuit, large);
        auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit);
        if (large) {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 19);
        } else {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 17);
        };
    };
    run_test(true);
    run_test(false);
}

TEST_F(MegaMockCircuitsPinning, AppCircuitSizes)
{
    const auto run_test = [](bool large) {
        GoblinProver goblin;
        MegaCircuitBuilder app_circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_app_circuit(app_circuit, large);
        auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit);
        if (large) {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 19);
        } else {
            EXPECT_EQ(proving_key->proving_key.log_circuit_size, 17);
        };
    };
    run_test(true);
    run_test(false);
}

/**
 * @brief Regression test that the structured circuit size has not increased over a power of 2.
 */
TEST_F(MegaMockCircuitsPinning, SmallTestStructuredCircuitSize)
{
    GoblinProver goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, trace_settings);
    EXPECT_EQ(proving_key->proving_key.log_circuit_size, 18);
}

TEST_F(MegaMockCircuitsPinning, ClientIVCBenchStructuredCircuitSize)
{
    GoblinProver goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    TraceSettings trace_settings{ CLIENT_IVC_BENCH_STRUCTURE };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, trace_settings);
    EXPECT_EQ(proving_key->proving_key.log_circuit_size, 19);
}

TEST_F(MegaMockCircuitsPinning, E2EStructuredCircuitSize)
{
    GoblinProver goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    TraceSettings trace_settings{ E2E_FULL_TEST_STRUCTURE };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, trace_settings);
    EXPECT_EQ(proving_key->proving_key.log_circuit_size, 20);
}