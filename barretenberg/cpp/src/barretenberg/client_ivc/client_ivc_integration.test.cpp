#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

/**
 * @brief A test suite that mirrors the logic in the nominal IVC benchmark case
 *
 */
class ClientIVCIntegrationTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Flavor = ClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = ClientIVC::ClientCircuit;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
};

/**
 * @brief Prove and verify accumulation of a set of mocked private function execution circuits
 * @details This case is meant to mirror the medium complexity benchmark configuration case but processes only 6
 * circuits total (3 app, 3 kernel) to save time.
 *
 */
TEST_F(ClientIVCIntegrationTests, BenchmarkCaseSimple)
{
    const size_t NUM_CIRCUITS = 6;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    MockCircuitProducer circuit_producer;

    // Construct and accumulate a series of mocked private function execution circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);

        ivc.accumulate(circuit);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Accumulate a set of circuits that includes consecutive kernels
 * @details In practice its common to have multiple consecutive kernels without intermittent apps e.g. an inner followed
 * immediately by a reset, or an inner-reset-tail sequence. This test ensures that such cases are handled correctly.
 *
 */
TEST_F(ClientIVCIntegrationTests, ConsecutiveKernels)
{
    const size_t NUM_CIRCUITS = 6;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    MockCircuitProducer circuit_producer;

    // Accumulate a series of mocked circuits (app, kernel, app, kernel)
    for (size_t idx = 0; idx < NUM_CIRCUITS - 2; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);
        ivc.accumulate(circuit);
    }

    // Cap the IVC with two more kernels (say, a 'reset' and a 'tail') without intermittent apps
    Builder reset_kernel = circuit_producer.create_next_circuit(ivc, /*force_is_kernel=*/true);
    ivc.accumulate(reset_kernel);
    Builder tail_kernel = circuit_producer.create_next_circuit(ivc, /*force_is_kernel=*/true);
    ivc.accumulate(tail_kernel);

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Prove and verify accumulation of a set of mocked private function execution circuits with precomputed
 * verification keys
 *
 */
TEST_F(ClientIVCIntegrationTests, BenchmarkCasePrecomputedVKs)
{
    const size_t NUM_CIRCUITS = 6;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    // Precompute the verification keys for each circuit in the IVC
    std::vector<std::shared_ptr<VerificationKey>> precomputed_vks;
    {
        MockCircuitProducer circuit_producer;
        precomputed_vks = circuit_producer.precompute_vks(NUM_CIRCUITS, ivc.trace_settings);
    }

    MockCircuitProducer circuit_producer;
    // Construct and accumulate a series of mocked private function execution circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);

        ivc.accumulate(circuit, precomputed_vks[idx]);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Demonstrate that a databus inconsistency leads to verification failure for the IVC
 * @details Kernel circuits contain databus consistency checks that establish that data was passed faithfully between
 * circuits, e.g. the output (return_data) of an app was the input (secondary_calldata) of a kernel. This test tampers
 * with the databus in such a way that one of the kernels receives secondary_calldata based on tampered app return data.
 * This leads to an invalid witness in the check that ensures that the two corresponding commitments are equal and thus
 * causes failure of the IVC to verify.
 *
 */
TEST_F(ClientIVCIntegrationTests, DatabusFailure)
{
    size_t NUM_CIRCUITS = 6;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    MockCircuitProducer circuit_producer;

    // Construct and accumulate a series of mocked private function execution circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);

        // Tamper with the return data of the second app circuit before it is processed as input to the next kernel
        if (idx == 2) {
            circuit_producer.tamper_with_databus();
        }

        ivc.accumulate(circuit);
    }

    EXPECT_FALSE(ivc.prove_and_verify());
};
