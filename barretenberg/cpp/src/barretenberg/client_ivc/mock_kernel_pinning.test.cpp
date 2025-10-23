#include "barretenberg/client_ivc/sumcheck_client_ivc.hpp"
#include "barretenberg/client_ivc/sumcheck_mock_circuit_producer.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief For benchmarking, we want to be sure that our mocking functions create circuits of a known size. We control
 * this, to the degree that matters for proof construction time, using these "pinning tests" that fix values.
 *
 */
class MockKernelTest : public ::testing::Test {
  public:
    using Builder = MegaCircuitBuilder;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }
};

TEST_F(MockKernelTest, DisablePinFoldingKernelSizes)
{
    MockCircuitProducer circuit_producer{ /*num_app_circuits=*/1 };
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    SumcheckClientIVC ivc{ NUM_CIRCUITS };

    // Construct and accumulate a series of mocked private function execution circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto [circuit, vk] = circuit_producer.create_next_circuit_and_vk(ivc);

        ivc.accumulate(circuit, vk);
        // Expect trace overflow for all but the hiding kernel (final circuit)
        if (idx < NUM_CIRCUITS - 1) {
            // EXPECT_TRUE(circuit.blocks.has_overflow);
            // EXPECT_EQ(ivc.prover_accumulator.log_dyadic_size, 19);
        } else {
            EXPECT_FALSE(circuit.blocks.has_overflow);
        }
    }
}
