#include "barretenberg/client_ivc/sumcheck_client_ivc.hpp"
#include "barretenberg/client_ivc/sumcheck_mock_circuit_producer.hpp"
#include "barretenberg/client_ivc/sumcheck_test_bench_shared.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/protogalaxy/folding_test_utils.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "gtest/gtest.h"

using namespace bb;

// static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1511): The CIVC class should enforce the minimum number of
// circuits in a test flow.

class SumcheckClientIVCTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Flavor = SumcheckClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = SumcheckClientIVC::ClientCircuit;
    using ProverInstance = SumcheckClientIVC::ProverInstance;
    using VerifierInstance = SumcheckClientIVC::VerifierInstance;
    using FoldProof = SumcheckClientIVC::FoldProof;
    using DeciderProver = SumcheckClientIVC::DeciderProver;
    using DeciderVerifier = SumcheckClientIVC::DeciderVerifier;
    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

  public:
    static std::pair<SumcheckClientIVC::Proof, SumcheckClientIVC::VerificationKey> accumulate_and_prove_ivc(
        size_t num_app_circuits)
    {
        CircuitProducer circuit_producer(num_app_circuits);
        const size_t num_circuits = circuit_producer.total_num_circuits;
        SumcheckClientIVC ivc{ num_circuits };
        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }

        info("Num ecc rows: ", ivc.goblin.op_queue->get_num_rows());
        // info("Num ecc ultra ops: ", ivc.goblin.op_queue->get_ultra_ops_table_num_rows());

        return { ivc.prove(), ivc.get_vk() };
    };
};

/**
 * @brief Using a structured trace allows for the accumulation of circuits of varying size
 *
 */
TEST_F(SumcheckClientIVCTests, BasicStructured)
{
    // BB_DISABLE_ASSERTS();
    const size_t NUM_APP_CIRCUITS = 15;
    auto [proof, vk] = SumcheckClientIVCTests::accumulate_and_prove_ivc(NUM_APP_CIRCUITS);

    EXPECT_TRUE(SumcheckClientIVC::verify(proof, vk));
};
