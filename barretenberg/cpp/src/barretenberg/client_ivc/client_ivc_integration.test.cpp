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
    const size_t NUM_APP_CIRCUITS = 2;
    MockCircuitProducer circuit_producer{ NUM_APP_CIRCUITS };
    const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    // Construct and accumulate a series of mocked private function execution circuits
    circuit_producer.create_mock_ivc_stack(TestSettings{}, ivc);

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Demonstrate that a databus inconsistency leads to verification failure for the IVC
 * @details Kernel circuits contain databus consistency checks that establish that data was passed faithfully between
 * circuits, e.g. the output (return_data) of an app was the input (secondary_calldata) of a kernel. This test
 tampers
 * with the databus in such a way that one of the kernels receives secondary_calldata based on tampered app return
 data.
 * This leads to an invalid witness in the check that ensures that the two corresponding commitments are equal and
 thus
 * causes failure of the IVC to verify.
 *
 */
TEST_F(ClientIVCIntegrationTests, DatabusFailure)
{
    size_t NUM_APP_CIRCUITS = 3;
    MockCircuitProducer circuit_producer{ NUM_APP_CIRCUITS };
    size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    // Construct and accumulate a series of mocked private function execution circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto [circuit, vk] = circuit_producer.create_next_circuit_and_vk(ivc);

        // Tamper with the return data of the second app circuit before it is processed as input to the next kernel
        if (idx == 2) {
            circuit_producer.tamper_with_databus();
        }

        ivc.accumulate(circuit, vk);
    }

    EXPECT_FALSE(ivc.prove_and_verify());
};
