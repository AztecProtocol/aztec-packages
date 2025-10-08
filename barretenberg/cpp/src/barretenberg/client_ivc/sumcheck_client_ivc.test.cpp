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

    using Flavor = ClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = ClientIVC::ClientCircuit;
    using ProverInstance = ClientIVC::ProverInstance;
    using VerifierInstance = ClientIVC::VerifierInstance;
    using FoldProof = ClientIVC::FoldProof;
    using DeciderProver = ClientIVC::DeciderProver;
    using DeciderVerifier = ClientIVC::DeciderVerifier;
    using FoldingProver = ProtogalaxyProver_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<VerifierInstance>;
    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

  public:
    /**
     * @brief Tamper with a proof
     * @details The first value in the proof after the public inputs is the commitment to the wire w.l (see
     * OinkProver). We modify the commitment by adding Commitment::one().
     *
     */
    static void tamper_with_proof(FoldProof& proof, size_t public_inputs_offset)
    {
        // Tamper with the commitment in the proof
        Commitment commitment = bb::field_conversion::convert_from_bn254_frs<Commitment>(
            std::span{ proof }.subspan(public_inputs_offset, bb::field_conversion::calc_num_bn254_frs<Commitment>()));
        commitment = commitment + Commitment::one();
        auto commitment_frs = bb::field_conversion::convert_to_bn254_frs<Commitment>(commitment);
        for (size_t idx = 0; idx < 4; ++idx) {
            proof[public_inputs_offset + idx] = commitment_frs[idx];
        }
    }

    static std::pair<ClientIVC::Proof, ClientIVC::VerificationKey> accumulate_and_prove_ivc(size_t num_app_circuits,
                                                                                            TestSettings settings = {})
    {
        CircuitProducer circuit_producer(num_app_circuits);
        const size_t num_circuits = circuit_producer.total_num_circuits;
        TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
        ClientIVC ivc{ num_circuits, trace_settings };

        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        return { ivc.prove(), ivc.get_vk() };
    };
};

/**
 * @brief Using a structured trace allows for the accumulation of circuits of varying size
 *
 */
TEST_F(SumcheckClientIVCTests, BasicStructured)
{
    const size_t NUM_APP_CIRCUITS = 1;
    auto [proof, vk] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS);

    EXPECT_TRUE(ClientIVC::verify(proof, vk));
};
