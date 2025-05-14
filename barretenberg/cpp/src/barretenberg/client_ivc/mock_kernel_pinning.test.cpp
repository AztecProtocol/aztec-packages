#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
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

TEST_F(MockKernelTest, PinFoldingKernelSizes)
{
    ClientIVC ivc{ { AZTEC_TRACE_STRUCTURE } };

    MockCircuitProducer circuit_producer;

    // Construct and accumulate a series of mocked private function execution circuits
    size_t NUM_CIRCUITS = 4;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);

        ivc.accumulate(circuit);
        EXPECT_TRUE(circuit.blocks.has_overflow); // trace overflow mechanism should be triggered
    }

    EXPECT_EQ(ivc.fold_output.accumulator->proving_key.log_circuit_size, 19);
}
