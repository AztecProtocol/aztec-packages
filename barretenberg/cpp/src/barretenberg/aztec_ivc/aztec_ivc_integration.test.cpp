#include "barretenberg/aztec_ivc/aztec_ivc.hpp"
#include "barretenberg/aztec_ivc/mock_circuit_producer.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"

#include <gtest/gtest.h>

using namespace bb;

class AztecIVCIntegrationTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory("../srs_db/ignition");
        srs::init_grumpkin_crs_factory("../srs_db/grumpkin");
    }

    using Flavor = AztecIVC::Flavor;
    using FF = typename Flavor::FF;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = AztecIVC::ClientCircuit;
    using MockCircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
};

/**
 * @brief Prove and verify accumulation of a set of mocked private function execution circuits
 * @details This case is meant to mirror the medium complexity benchmark configuration case but processes only 6
 * circuits total (3 app, 3 kernel) to save time.
 *
 */
TEST_F(AztecIVCIntegrationTests, BenchmarkCaseSimple)
{
    AztecIVC ivc;
    ivc.trace_structure = TraceStructure::AZTEC_IVC_BENCH;

    MockCircuitProducer circuit_producer;

    // Construct and accumulate a series of mocked private function execution circuits
    size_t NUM_CIRCUITS = 6;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);

        ivc.execute_accumulation_prover(circuit);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Prove and verify accumulation of a set of mocked private function execution circuits
 * @details This case is meant to mirror the medium complexity benchmark configuration case but processes only 6
 * circuits total (3 app, 3 kernel) to save time.
 *
 */
TEST_F(AztecIVCIntegrationTests, BenchmarkCasePrecomputedVKs)
{
    AztecIVC ivc;
    ivc.trace_structure = TraceStructure::AZTEC_IVC_BENCH;

    size_t NUM_CIRCUITS = 6;

    MockCircuitProducer circuit_producer;

    auto precomputed_vks = circuit_producer.precompute_verification_keys(NUM_CIRCUITS, ivc.trace_structure);

    // Construct and accumulate a series of mocked private function execution circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);

        ivc.execute_accumulation_prover(circuit, precomputed_vks[idx]);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};
