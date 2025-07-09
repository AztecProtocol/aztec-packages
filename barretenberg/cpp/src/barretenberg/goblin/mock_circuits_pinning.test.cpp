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
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(MegaMockCircuitsPinning, AppCircuitSizes)
{
    const auto run_test = [](bool large) {
        Goblin goblin;
        MegaCircuitBuilder app_circuit{ goblin.op_queue };
        GoblinMockCircuits::construct_mock_app_circuit(app_circuit, large);
        TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
        auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, trace_settings);
        if (large) {
            EXPECT_EQ(proving_key->log_dyadic_size(), 19);
        } else {
            EXPECT_EQ(proving_key->log_dyadic_size(), 18);
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
    Goblin goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    GoblinMockCircuits::PairingPoints::add_default_to_public_inputs(app_circuit);
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, trace_settings);
    EXPECT_EQ(proving_key->log_dyadic_size(), 18);
}

TEST_F(MegaMockCircuitsPinning, AztecStructuredCircuitSize)
{
    Goblin goblin;
    MegaCircuitBuilder app_circuit{ goblin.op_queue };
    GoblinMockCircuits::PairingPoints::add_default_to_public_inputs(app_circuit);
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    auto proving_key = std::make_shared<DeciderProvingKey>(app_circuit, trace_settings);
    EXPECT_EQ(proving_key->log_dyadic_size(), 18);
}
