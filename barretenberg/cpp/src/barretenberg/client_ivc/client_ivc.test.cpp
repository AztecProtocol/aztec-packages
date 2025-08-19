#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/client_ivc/mock_circuit_producer.hpp"
#include "barretenberg/client_ivc/test_bench_shared.hpp"
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

// static constexpr size_t MAX_NUM_KERNELS = 15;
static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;
// static constexpr size_t MEDIUM_LOG_2_NUM_GATES = 16;

class ClientIVCTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Flavor = ClientIVC::Flavor;
    using FF = typename Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = ClientIVC::ClientCircuit;
    using DeciderProvingKey = ClientIVC::DeciderProvingKey;
    using DeciderVerificationKey = ClientIVC::DeciderVerificationKey;
    using FoldProof = ClientIVC::FoldProof;
    using DeciderProver = ClientIVC::DeciderProver;
    using DeciderVerifier = ClientIVC::DeciderVerifier;
    using DeciderProvingKeys = DeciderProvingKeys_<Flavor>;
    using FoldingProver = ProtogalaxyProver_<Flavor>;
    using DeciderVerificationKeys = DeciderVerificationKeys_<Flavor>;
    using FoldingVerifier = ProtogalaxyVerifier_<DeciderVerificationKeys>;
    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

    /**
     * @brief Tamper with a proof
     *
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
            // Use default test settings for the mock hiding kernel since it's size must always be consistent
            if (j == num_circuits - 1) {
                settings = TestSettings{};
            }
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        return { ivc.prove(), ivc.get_vk() };
    };
};

/**
 * @brief Using a structured trace allows for the accumulation of circuits of varying size
 *
 */
TEST_F(ClientIVCTests, BasicStructured)
{
    const size_t NUM_APP_CIRCUITS = 1;
    auto [proof, vk] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS);

    EXPECT_TRUE(ClientIVC::verify(proof, vk));
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
    const size_t NUM_APP_CIRCUITS = 2;
    TraceSettings trace_settings{ SMALL_TEST_STRUCTURE };
    // Confirm that the IVC verifies if nothing is tampered with
    {

        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        ClientIVC ivc{ NUM_CIRCUITS, trace_settings };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        EXPECT_TRUE(ivc.prove_and_verify());
    }

    // The IVC throws an exception if the FIRST fold proof is tampered with
    {
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        ClientIVC ivc{ NUM_CIRCUITS, trace_settings };

        size_t num_public_inputs = 0;

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto [circuit, vk] =
                circuit_producer.create_next_circuit_and_vk(ivc, { .log2_num_gates = SMALL_LOG_2_NUM_GATES });
            ivc.accumulate(circuit, vk);

            if (idx == 1) {
                num_public_inputs = circuit.num_public_inputs();
            }

            if (idx == 2) {
                EXPECT_EQ(ivc.verification_queue.size(), 2); // two proofs after 3 calls to accumulation
                tamper_with_proof(ivc.verification_queue[0].proof,
                                  num_public_inputs); // tamper with first proof
            }
        }
        EXPECT_FALSE(ivc.prove_and_verify());
    }

    // The IVC fails if the SECOND fold proof is tampered with
    {
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        ClientIVC ivc{ NUM_CIRCUITS, trace_settings };

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto [circuit, vk] =
                circuit_producer.create_next_circuit_and_vk(ivc, { .log2_num_gates = SMALL_LOG_2_NUM_GATES });
            ivc.accumulate(circuit, vk);

            if (idx == 2) {
                EXPECT_EQ(ivc.verification_queue.size(), 2); // two proofs after 3 calls to accumulation
                tamper_with_proof(ivc.verification_queue[1].proof,
                                  circuit.num_public_inputs()); // tamper with second proof
            }
        }
        EXPECT_FALSE(ivc.prove_and_verify());
    }

    EXPECT_TRUE(true);
};

/**
 * @brief Produce 2 valid CIVC proofs. Ensure that replacing a proof component with a component from a different proof
 * leads to a verification failure.
 *
 */
TEST_F(ClientIVCTests, WrongProofComponentFailure)
{
    // Produce two valid proofs
    auto [civc_proof_1, civc_vk_1] = accumulate_and_prove_ivc(/*num_app_circuits=*/1);
    {
        EXPECT_TRUE(ClientIVC::verify(civc_proof_1, civc_vk_1));
    }

    auto [civc_proof_2, civc_vk_2] = accumulate_and_prove_ivc(/*num_app_circuits=*/1);
    {
        EXPECT_TRUE(ClientIVC::verify(civc_proof_2, civc_vk_2));
    }

    {
        // Replace Merge proof
        ClientIVC::Proof tampered_proof = civc_proof_1;

        tampered_proof.goblin_proof.merge_proof = civc_proof_2.goblin_proof.merge_proof;

        EXPECT_THROW_OR_ABORT(ClientIVC::verify(tampered_proof, civc_vk_1), ".*IPA verification fails.*");
    }

    {
        // Replace hiding circuit proof
        ClientIVC::Proof tampered_proof = civc_proof_1;

        tampered_proof.mega_proof = civc_proof_2.mega_proof;

        EXPECT_THROW_OR_ABORT(ClientIVC::verify(tampered_proof, civc_vk_1), ".*IPA verification fails.*");
    }

    {
        // Replace ECCVM proof
        ClientIVC::Proof tampered_proof = civc_proof_1;

        tampered_proof.goblin_proof.eccvm_proof = civc_proof_2.goblin_proof.eccvm_proof;

        EXPECT_THROW_OR_ABORT(ClientIVC::verify(tampered_proof, civc_vk_1), ".*IPA verification fails.*");
    }

    {
        // Replace Translator proof
        ClientIVC::Proof tampered_proof = civc_proof_1;

        tampered_proof.goblin_proof.translator_proof = civc_proof_2.goblin_proof.translator_proof;

        EXPECT_FALSE(ClientIVC::verify(tampered_proof, civc_vk_1));
    }
};

/**
 * @brief Ensure that the CIVC VK is independent of the number of circuits accumulated
 *
 */
TEST_F(ClientIVCTests, VKIndependenceTest)
{
    const TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    auto [unused_1, civc_vk_1] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);
    auto [unused_2, civc_vk_2] = accumulate_and_prove_ivc(/*num_app_circuits=*/3, settings);

    // Check the equality of the Mega components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_1.mega.get(), *civc_vk_2.mega.get());

    // Check the equality of the ECCVM components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_1.eccvm.get(), *civc_vk_2.eccvm.get());

    // Check the equality of the Translator components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_1.translator.get(), *civc_vk_2.translator.get());
};

/**
 * @brief Ensure that the CIVC VK is independent of whether any of the circuits being accumulated overflows the
 * structured trace
 * @details If one of the circuits being accumulated overflows the structured trace, the dyadic size of the
 accumulator
 * may increase. In this case we want to ensure that the CIVC VK (and in particular the hiding circuit VK) is
 identical
 * to the non-overflow case. This requires, for example, that the padding_indicator_array logic used in somecheck is
 * functioning properly.
 */
TEST_F(ClientIVCTests, VKIndependenceWithOverflow)
{
    // Run IVC for two sets of circuits: a nomical case where all circuits fit within the structured trace and an
    // "overflow" case where all (but importantly at least one) circuit overflows the structured trace.
    const size_t NUM_APP_CIRCUITS = 1;
    const size_t log2_num_gates_nominal = 5;   // number of gates in baseline mocked circuits
    const size_t log2_num_gates_overflow = 18; // number of gates in the "overflow" mocked circuit

    const TestSettings settings_1{ .log2_num_gates = log2_num_gates_nominal };
    const TestSettings settings_2{ .log2_num_gates = log2_num_gates_overflow };

    auto [unused_1, civc_vk_1] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, settings_1);
    auto [unused_2, civc_vk_2] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, settings_2);

    // Check the equality of the Mega components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_1.mega.get(), *civc_vk_2.mega.get());

    // Check the equality of the ECCVM components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_1.eccvm.get(), *civc_vk_2.eccvm.get());

    // Check the equality of the Translator components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_1.translator.get(), *civc_vk_2.translator.get());
};

// /**
//  * @brief Test that running the benchmark suite with mocked verification keys will not error out.
//  */
// HEAVY_TEST(ClientIVCBenchValidation, Full6MockedVKs)
// {
//     const auto run_test = []() {
//         bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

//         const size_t total_num_circuits{ 12 };
//         ClientIVC ivc{ total_num_circuits, { AZTEC_TRACE_STRUCTURE } };
//         PrivateFunctionExecutionMockCircuitProducer circuit_producer;
//         auto mocked_vks = mock_vks(total_num_circuits);
//         perform_ivc_accumulation_rounds(total_num_circuits, ivc, mocked_vks, /* mock_vk */ true);
//         auto proof = ivc.prove();
//         verify_ivc(proof, ivc);
//     };
//     ASSERT_NO_FATAL_FAILURE(run_test());
// }

HEAVY_TEST(ClientIVCKernelCapacity, MaxCapacityPassing)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    // WORKTODO: Figure out what max number of apps is!
    const size_t num_app_circuits = 6;
    PrivateFunctionExecutionMockCircuitProducer circuit_producer(num_app_circuits);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    ClientIVC ivc{ num_circuits };

    for (size_t j = 0; j < num_circuits; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }
    auto proof = ivc.prove();

    EXPECT_TRUE(ivc.verify(proof));
}

/**
 * @brief Test the structured trace overflow mechanism in a variety of different scenarios
 *
 */
TEST_F(ClientIVCTests, DynamicTraceOverflow)
{
    struct TestCase {
        std::string name;
        std::vector<size_t> log2_num_arith_gates;
    };

    // Define some test cases that overflow the structured trace in different ways at different points in the
    // accumulation. We distinguish between a simple overflow that exceeds one or more structured trace capacities but
    // does not bump the dyadic circuit size and an overflow that does increase the dyadic circuit size.
    std::vector<TestCase> test_cases = {
        { "Case 1", { 14, 18, 14, 16, 14 } }, /* dyadic size overflow then simple overflow */
        { "Case 2", { 14, 16, 14, 18, 14 } }, /* simple overflow then dyadic size overflow */
    };

    for (const auto& test : test_cases) {
        SCOPED_TRACE(test.name); // improves test output readability

        CircuitProducer circuit_producer(/*num_app_circuits=*/1);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        ClientIVC ivc{ NUM_CIRCUITS, { SMALL_TEST_STRUCTURE_FOR_OVERFLOWS } };

        // Accumulate
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(
                ivc, { .log2_num_gates = test.log2_num_arith_gates[idx] });
        }

        EXPECT_EQ(check_accumulator_target_sum_manual(ivc.fold_output.accumulator), true);
        EXPECT_TRUE(ivc.prove_and_verify());
    }
}

/**
 * @brief Test methods for serializing and deserializing a proof to/from a file/buffer in msgpack format
 *
 */
TEST_F(ClientIVCTests, MsgpackProofFromFileOrBuffer)
{
    // Generate an arbitrary valid CICV proof
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
    auto [proof, vk] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);

    { // Serialize/deserialize the proof to/from a file, check that it verifies
        const std::string filename = "proof.msgpack";
        proof.to_file_msgpack(filename);
        auto proof_deserialized = ClientIVC::Proof::from_file_msgpack(filename);

        EXPECT_TRUE(ClientIVC::verify(proof_deserialized, vk));
    }

    { // Serialize/deserialize proof to/from a heap buffer, check that it verifies
        uint8_t* buffer = proof.to_msgpack_heap_buffer();
        auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);
        uint8_t const* uint8_ptr = uint8_buffer.data();
        auto proof_deserialized = ClientIVC::Proof::from_msgpack_buffer(uint8_ptr);

        EXPECT_TRUE(ClientIVC::verify(proof_deserialized, vk));
    }

    { // Check that attempting to deserialize a proof from a buffer with random bytes fails gracefully
        msgpack::sbuffer buffer = proof.to_msgpack_buffer();
        auto proof_deserialized = ClientIVC::Proof::from_msgpack_buffer(buffer);
        EXPECT_TRUE(ClientIVC::verify(proof_deserialized, vk));

        std::vector<uint8_t> random_bytes(buffer.size());
        std::generate(random_bytes.begin(), random_bytes.end(), []() { return static_cast<uint8_t>(rand() % 256); });
        std::copy(random_bytes.begin(), random_bytes.end(), buffer.data());

        // Expect deserialization to fail with error msgpack::v1::type_error with description "std::bad_cast"
        EXPECT_THROW(ClientIVC::Proof::from_msgpack_buffer(buffer), msgpack::v1::type_error);
    }
};
