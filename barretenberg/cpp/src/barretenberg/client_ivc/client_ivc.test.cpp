#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/test_bench_shared.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/protogalaxy/folding_test_utils.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include <gtest/gtest.h>

using namespace bb;

class ClientIVCTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite()
    {
        srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());
    }

    using Flavor = ClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = ClientIVC::ClientCircuit;
    using DeciderProvingKey = ClientIVC::DeciderProvingKey;
    using DeciderVerificationKey = ClientIVC::DeciderVerificationKey;
    using FoldProof = ClientIVC::FoldProof;
    using DeciderProver = ClientIVC::DeciderProver;
    using DeciderVerifier = ClientIVC::DeciderVerifier;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<DeciderProvingKeys>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<DeciderVerificationKeys>;

    /**
     * @brief Construct mock circuit with arithmetic gates and goblin ops
     * @details Defaulted to add 2^16 gates (which will bump to next power of two with the addition of dummy gates).
     * The size of the baseline circuit needs to be ~2x the number of gates appended to the kernel circuits via
     * recursive verifications (currently ~60k) to ensure that the circuits being folded are equal in size. (This is
     * only necessary if the structured trace is not in use).
     *
     */
    static Builder create_mock_circuit(ClientIVC& ivc, size_t log2_num_gates = 16)
    {
        Builder circuit{ ivc.goblin.op_queue };
        MockCircuits::construct_arithmetic_circuit(circuit, log2_num_gates);

        // TODO(https://github.com/AztecProtocol/barretenberg/issues/911): We require goblin ops to be added to the
        // function circuit because we cannot support zero commtiments. While the builder handles this at
        // finalisation stage via the add_gates_to_ensure_all_polys_are_non_zero function for other MegaHonk
        // circuits (where we don't explicitly need to add goblin ops), in ClientIVC merge proving happens prior to
        // folding where the absense of goblin ecc ops will result in zero commitments.
        MockCircuits::construct_goblin_ecc_op_circuit(circuit);
        return circuit;
    }

    /**
     * @brief A test utility for generating alternating mock app and kernel circuits and precomputing verification keys
     *
     */
    class MockCircuitProducer {
        using ClientCircuit = ClientIVC::ClientCircuit;

        bool is_kernel = false;

      public:
        ClientCircuit create_next_circuit(ClientIVC& ivc, size_t log2_num_gates = 16)
        {
            ClientCircuit circuit{ ivc.goblin.op_queue };
            circuit = create_mock_circuit(ivc, log2_num_gates); // construct mock base logic
            if (is_kernel) {
                ivc.complete_kernel_circuit_logic(circuit); // complete with recursive verifiers etc
            }
            is_kernel = !is_kernel; // toggle is_kernel on/off alternatingly

            return circuit;
        }

        auto precompute_verification_keys(const size_t num_circuits,
                                          TraceSettings trace_settings,
                                          size_t log2_num_gates = 16)
        {
            ClientIVC ivc{ trace_settings }; // temporary IVC instance needed to produce the complete kernel circuits

            std::vector<std::shared_ptr<VerificationKey>> vkeys;

            for (size_t idx = 0; idx < num_circuits; ++idx) {
                ClientCircuit circuit = create_next_circuit(ivc, log2_num_gates); // create the next circuit
                ivc.accumulate(circuit);                                          // accumulate the circuit
                vkeys.emplace_back(ivc.honk_vk);                                  // save the VK for the circuit
            }
            is_kernel = false;

            return vkeys;
        }
    };

    /**
     * @brief Tamper with a proof by finding the first non-zero value and incrementing it by 1
     *
     */
    static void tamper_with_proof(FoldProof& proof)
    {
        for (auto& val : proof) {
            if (val > 0) {
                val += 1;
                break;
            }
        }
    }
};

/**
 * @brief A simple-as-possible test demonstrating IVC for two mock circuits
 * @details When accumulating only two circuits, only a single round of folding is performed thus no recursive
 * verification occurs.
 *
 */
TEST_F(ClientIVCTests, Basic)
{
    ClientIVC ivc;

    MockCircuitProducer circuit_producer;

    // Initialize the IVC with an arbitrary circuit
    Builder circuit_0 = circuit_producer.create_next_circuit(ivc);
    ivc.accumulate(circuit_0);

    // Create another circuit and accumulate
    Builder circuit_1 = circuit_producer.create_next_circuit(ivc);
    ivc.accumulate(circuit_1);

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief A simple test demonstrating IVC for four mock circuits, which is slightly more than minimal.
 * @details When accumulating only four circuits, we execute all the functionality of a full ClientIVC run.
 *
 */
TEST_F(ClientIVCTests, BasicFour)
{
    ClientIVC ivc;

    MockCircuitProducer circuit_producer;
    for (size_t idx = 0; idx < 4; ++idx) {
        Builder circuit = circuit_producer.create_next_circuit(ivc);
        ivc.accumulate(circuit);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Check that the IVC fails if an intermediate fold proof is invalid
 * @details When accumulating 4 circuits, there are 3 fold proofs to verify (the first two are recursively verfied and
 * the 3rd is verified as part of the IVC proof). Check that if any of one of these proofs is invalid, the IVC will
 * fail.
 *
 */
TEST_F(ClientIVCTests, BadProofFailure)
{
    // Confirm that the IVC verifies if nothing is tampered with
    {
        ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

        MockCircuitProducer circuit_producer;

        // Construct and accumulate a set of mocked private function execution circuits
        size_t NUM_CIRCUITS = 4;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
            ivc.accumulate(circuit);
        }
        EXPECT_TRUE(ivc.prove_and_verify());
    }

    // The IVC throws an exception if the FIRST fold proof is tampered with
    {
        ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

        MockCircuitProducer circuit_producer;

        // Construct and accumulate a set of mocked private function execution circuits
        size_t NUM_CIRCUITS = 4;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            if (idx == 3) { // At idx = 3, we've tampered with the one of the folding proofs so create the recursive
                            // folding verifier will throw an error.
                EXPECT_ANY_THROW(circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5));
                break;
            }
            auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
            ivc.accumulate(circuit);

            if (idx == 2) {
                EXPECT_EQ(ivc.verification_queue.size(), 2);        // two proofs after 3 calls to accumulation
                tamper_with_proof(ivc.verification_queue[0].proof); // tamper with first proof
            }
        }
    }

    // The IVC fails if the SECOND fold proof is tampered with
    {
        ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

        MockCircuitProducer circuit_producer;

        // Construct and accumulate a set of mocked private function execution circuits
        size_t NUM_CIRCUITS = 4;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            if (idx == 3) { // At idx = 3, we've tampered with the one of the folding proofs so create the recursive
                            // folding verifier will throw an error.
                EXPECT_ANY_THROW(circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5));
                break;
            }
            auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
            ivc.accumulate(circuit);

            if (idx == 2) {
                EXPECT_EQ(ivc.verification_queue.size(), 2);        // two proofs after 3 calls to accumulation
                tamper_with_proof(ivc.verification_queue[1].proof); // tamper with second proof
            }
        }
    }

    // The IVC fails if the 3rd/FINAL fold proof is tampered with
    {
        ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

        MockCircuitProducer circuit_producer;

        // Construct and accumulate a set of mocked private function execution circuits
        size_t NUM_CIRCUITS = 4;
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto circuit = circuit_producer.create_next_circuit(ivc, /*log2_num_gates=*/5);
            ivc.accumulate(circuit);
        }

        // Only a single proof should be present in the queue when verification of the IVC is performed
        EXPECT_EQ(ivc.verification_queue.size(), 1);
        tamper_with_proof(ivc.verification_queue[0].proof); // tamper with the final fold proof

        EXPECT_ANY_THROW(ivc.prove_and_verify());
    }

    EXPECT_TRUE(true);
};

/**
 * @brief Prove and verify accumulation of an arbitrary set of circuits
 *
 */
TEST_F(ClientIVCTests, BasicLarge)
{
    ClientIVC ivc;

    MockCircuitProducer circuit_producer;

    // Construct and accumulate a set of mocked private function execution circuits
    size_t NUM_CIRCUITS = 6;
    std::vector<Builder> circuits;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        ivc.accumulate(circuit);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Using a structured trace allows for the accumulation of circuits of varying size
 *
 */
TEST_F(ClientIVCTests, BasicStructured)
{
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

    MockCircuitProducer circuit_producer;

    size_t NUM_CIRCUITS = 4;

    // Construct and accumulate some circuits of varying size
    size_t log2_num_gates = 5;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc, log2_num_gates);
        ivc.accumulate(circuit);
        log2_num_gates += 2;
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Prove and verify accumulation of an arbitrary set of circuits using precomputed verification keys
 *
 */
TEST_F(ClientIVCTests, PrecomputedVerificationKeys)
{
    ClientIVC ivc;

    size_t NUM_CIRCUITS = 4;

    MockCircuitProducer circuit_producer;

    auto precomputed_vks = circuit_producer.precompute_verification_keys(NUM_CIRCUITS, TraceSettings{});

    // Construct and accumulate set of circuits using the precomputed vkeys
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc);
        ivc.accumulate(circuit, /*one_circuit=*/false, precomputed_vks[idx]);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Perform accumulation with a structured trace and precomputed verification keys
 *
 */
TEST_F(ClientIVCTests, StructuredPrecomputedVKs)
{
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE } };

    size_t NUM_CIRCUITS = 4;
    size_t log2_num_gates = 5; // number of gates in baseline mocked circuit

    MockCircuitProducer circuit_producer;

    auto precomputed_vks =
        circuit_producer.precompute_verification_keys(NUM_CIRCUITS, ivc.trace_settings, log2_num_gates);

    // Construct and accumulate set of circuits using the precomputed vkeys
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc, log2_num_gates);
        ivc.accumulate(circuit, /*one_circuit=*/false, precomputed_vks[idx]);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Run a test using functions shared with the ClientIVC benchmark.
 * @details We do have this in addition to the above tests anyway so we can believe that the benchmark is running on
 * real data EXCEPT the verification keys, whose correctness is not needed to assess the performance of the folding
 * prover. Before this test was added, we spend more than 50% of the benchmarking time running an entire IVC prover
 * protocol just to precompute valid verification keys.
 */
TEST(ClientIVCBenchValidation, Full6)
{
    bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
    bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());

    ClientIVC ivc{ { CLIENT_IVC_BENCH_STRUCTURE } };
    size_t total_num_circuits{ 12 };
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    auto precomputed_vkeys = circuit_producer.precompute_verification_keys(total_num_circuits, ivc.trace_settings);
    perform_ivc_accumulation_rounds(total_num_circuits, ivc, precomputed_vkeys);
    auto proof = ivc.prove();
    bool verified = verify_ivc(proof, ivc);
    EXPECT_TRUE(verified);
}

/**
 * @brief Test that running the benchmark suite with movked verification keys will not error out.
 */
TEST(ClientIVCBenchValidation, Full6MockedVKs)
{
    const auto run_test = []() {
        bb::srs::init_crs_factory(bb::srs::get_ignition_crs_path());
        bb::srs::init_grumpkin_crs_factory(bb::srs::get_grumpkin_crs_path());

        ClientIVC ivc{ { CLIENT_IVC_BENCH_STRUCTURE } };
        size_t total_num_circuits{ 12 };
        PrivateFunctionExecutionMockCircuitProducer circuit_producer;
        auto mocked_vkeys = mock_verification_keys(total_num_circuits);
        perform_ivc_accumulation_rounds(total_num_circuits, ivc, mocked_vkeys, /* mock_vk */ true);
        auto proof = ivc.prove();
        verify_ivc(proof, ivc);
    };
    ASSERT_NO_FATAL_FAILURE(run_test());
}

/**
 * @brief Test use of structured trace overflow block mechanism
 * @details Accumulate 4 circuits which have progressively more arithmetic gates. The final two overflow the prescribed
 * arithmetic block size and make use of the overflow block which has sufficient capacity.
 *
 */
TEST_F(ClientIVCTests, StructuredTraceOverflow)
{

    // Define trace settings with sufficient overflow capacity to accommodate each of the circuits to be accumulated
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE, /*overflow_capacity=*/1 << 17 } };

    MockCircuitProducer circuit_producer;

    size_t NUM_CIRCUITS = 4;

    // Construct and accumulate some circuits of varying size
    size_t log2_num_gates = 14;
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc, log2_num_gates);
        ivc.accumulate(circuit);
        log2_num_gates += 1;
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Test dynamic structured trace overflow block mechanism
 * @details Tests the case where the required overflow capacity is not known until runtime. Accumulates two circuits,
 * the second of which overflows the trace but not enough to change the dyadic circuit size and thus there is no need
 * for a virtual size increase of the first key.
 *
 */
TEST_F(ClientIVCTests, DynamicOverflow)
{
    // Define trace settings with zero overflow capacity
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE_FOR_OVERFLOWS, /*overflow_capacity=*/0 } };

    MockCircuitProducer circuit_producer;

    const size_t NUM_CIRCUITS = 2;

    // define parameters for two circuits; the first fits within the structured trace, the second overflows
    const std::vector<size_t> log2_num_arith_gates = { 14, 16 };
    // Accumulate
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc, log2_num_arith_gates[idx]);
        ivc.accumulate(circuit);
    }

    EXPECT_EQ(check_accumulator_target_sum_manual(ivc.fold_output.accumulator), true);
    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Test dynamic trace overflow where the dyadic circuit size also increases
 * @details Accumulates two circuits, the second of which overflows the trace structure and leads to an increased dyadic
 * circuit size. This requires the virtual size of the polynomials in the first key to be increased accordingly which
 * should be handled automatically in PG/ClientIvc.
 *
 */
TEST_F(ClientIVCTests, DynamicOverflowCircuitSizeChange)
{
    uint32_t overflow_capacity = 0;
    // uint32_t overflow_capacity = 1 << 1;
    ClientIVC ivc{ { SMALL_TEST_STRUCTURE_FOR_OVERFLOWS, overflow_capacity } };

    MockCircuitProducer circuit_producer;

    const size_t NUM_CIRCUITS = 2;

    // define parameters for two circuits; the first fits within the structured trace, the second overflows
    const std::vector<size_t> log2_num_arith_gates = { 14, 18 };
    // Accumulate
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto circuit = circuit_producer.create_next_circuit(ivc, log2_num_arith_gates[idx]);
        ivc.accumulate(circuit);
    }

    EXPECT_EQ(check_accumulator_target_sum_manual(ivc.fold_output.accumulator), true);
    EXPECT_TRUE(ivc.prove_and_verify());
};