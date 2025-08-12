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

static constexpr size_t MAX_NUM_KERNELS = 15;
static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;
// TODO(https://github.com/AztecProtocol/barretenberg/issues/1511): The CIVC class should enforce the minimum number of
// circuits in a test flow.
static constexpr size_t MIN_NUM_CIRCUITS = 4;

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

    /**
     * @brief Tamper with a proof
     *
     * @details The first value in the proof after the public inputs is the commitment to the wire w.l (see OinkProver).
     * We modify the commitment by adding Commitment::one().
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

    static std::pair<ClientIVC::Proof, ClientIVC::VerificationKey> generate_ivc_proof(size_t num_circuits)
    {
        ClientIVC ivc{ num_circuits, { SMALL_TEST_STRUCTURE } };
        PrivateFunctionExecutionMockCircuitProducer circuit_producer;
        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc);
        }
        return { ivc.prove(), ivc.get_vk() };
    };
};

/**
 * @brief A simple test demonstrating IVC for four mock circuits, which is slightly more than minimal.
 * @details When accumulating only four circuits, we execute all the functionality of a full ClientIVC run.
 *
 */
TEST_F(ClientIVCTests, BasicFour)
{
    ClientIVC ivc{ /*num_circuits=*/MIN_NUM_CIRCUITS };

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
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
        ClientIVC ivc{ MIN_NUM_CIRCUITS, { SMALL_TEST_STRUCTURE } };

        PrivateFunctionExecutionMockCircuitProducer circuit_producer;
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        EXPECT_TRUE(ivc.prove_and_verify());
    }

    // The IVC throws an exception if the FIRST fold proof is tampered with
    {
        ClientIVC ivc{ MIN_NUM_CIRCUITS, { SMALL_TEST_STRUCTURE } };

        PrivateFunctionExecutionMockCircuitProducer circuit_producer;

        size_t num_public_inputs = 0;

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
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
        circuit_producer.construct_hiding_kernel(ivc);
        EXPECT_FALSE(ivc.prove_and_verify());
    }

    // The IVC fails if the SECOND fold proof is tampered with
    {
        ClientIVC ivc{ MIN_NUM_CIRCUITS, { SMALL_TEST_STRUCTURE } };

        PrivateFunctionExecutionMockCircuitProducer circuit_producer;

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
            auto [circuit, vk] =
                circuit_producer.create_next_circuit_and_vk(ivc, { .log2_num_gates = SMALL_LOG_2_NUM_GATES });
            ivc.accumulate(circuit, vk);

            if (idx == 2) {
                EXPECT_EQ(ivc.verification_queue.size(), 2); // two proofs after 3 calls to accumulation
                tamper_with_proof(ivc.verification_queue[1].proof,
                                  circuit.num_public_inputs()); // tamper with second proof
            }
        }
        circuit_producer.construct_hiding_kernel(ivc);
        EXPECT_FALSE(ivc.prove_and_verify());
    }

    // The IVC fails if the 3rd/FINAL fold proof is tampered with
    {
        ClientIVC ivc{ MIN_NUM_CIRCUITS, { SMALL_TEST_STRUCTURE } };

        PrivateFunctionExecutionMockCircuitProducer circuit_producer;

        size_t num_public_inputs = 0;

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
            auto [circuit, vk] =
                circuit_producer.create_next_circuit_and_vk(ivc, { .log2_num_gates = SMALL_LOG_2_NUM_GATES });
            ivc.accumulate(circuit, vk);

            if (idx == MIN_NUM_CIRCUITS - 1) {
                num_public_inputs = circuit.num_public_inputs();
            }
        }

        // Only a single proof should be present in the queue when verification of the IVC is performed
        EXPECT_EQ(ivc.verification_queue.size(), 1);
        tamper_with_proof(ivc.verification_queue[0].proof,
                          num_public_inputs); // tamper with the final fold proof

        circuit_producer.construct_hiding_kernel(ivc);

        EXPECT_FALSE(ivc.prove_and_verify());
    }

    EXPECT_TRUE(true);
};

/**
 * @brief Using a structured trace allows for the accumulation of circuits of varying size
 *
 */
TEST_F(ClientIVCTests, BasicStructured)
{

    TestSettings settings;
    ClientIVC ivc{ MIN_NUM_CIRCUITS, { SMALL_TEST_STRUCTURE } };

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    // Construct and accumulate some circuits of varying size
    for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
        settings.log2_num_gates = SMALL_LOG_2_NUM_GATES + idx;
        circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

/**
 * @brief Produce 2 valid CIVC proofs. Ensure that replacing a proof component with a component from a different
 proof
 * leads to a verification failure.
 *
 */
TEST_F(ClientIVCTests, WrongProofComponentFailure)
{
    // Produce two valid proofs
    auto [civc_proof_1, civc_vk_1] = generate_ivc_proof(MIN_NUM_CIRCUITS);
    {
        EXPECT_TRUE(ClientIVC::verify(civc_proof_1, civc_vk_1));
    }

    auto [civc_proof_2, civc_vk_2] = generate_ivc_proof(MIN_NUM_CIRCUITS);
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

    // An upper bound chosen for this test, in reality we can support more than 10 circuits
    const size_t MAX_NUM_CIRCUITS = 10;

    const TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    auto generate_vk = [&](size_t num_circuits) {
        ClientIVC ivc{ num_circuits, { SMALL_TEST_STRUCTURE } };
        PrivateFunctionExecutionMockCircuitProducer circuit_producer;
        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        ivc.prove();
        auto ivc_vk = ivc.get_vk();

        // PCS verification keys will not match so set to null before comparing
        ivc_vk.eccvm->pcs_verification_key = VerifierCommitmentKey<curve::Grumpkin>();

        return ivc_vk;
    };

    auto civc_vk_2 = generate_vk(MIN_NUM_CIRCUITS);
    auto civc_vk_20 = generate_vk(MAX_NUM_CIRCUITS);

    // Check the equality of the Mega components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_2.mega.get(), *civc_vk_20.mega.get());

    // Check the equality of the ECCVM components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_2.eccvm.get(), *civc_vk_20.eccvm.get());

    // Check the equality of the Translator components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_2.translator.get(), *civc_vk_20.translator.get());
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

    const size_t log2_num_gates_nominal = 5;   // number of gates in baseline mocked circuits
    const size_t log2_num_gates_overflow = 18; // number of gates in the "overflow" mocked circuit

    TraceStructure trace_structure = SMALL_TEST_STRUCTURE;

    // Check that we will indeed overflow the trace structure
    EXPECT_TRUE(1 << log2_num_gates_overflow > trace_structure.size()); // 1 << 18 > 1 << 16
    TestSettings settings;
    auto generate_vk = [&](size_t num_circuits, size_t log2_num_gates) {
        ClientIVC ivc{ num_circuits, { trace_structure } };
        PrivateFunctionExecutionMockCircuitProducer circuit_producer;
        for (size_t j = 0; j < num_circuits; ++j) {
            settings.log2_num_gates = log2_num_gates;
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        ivc.prove();
        auto ivc_vk = ivc.get_vk();

        // PCS verification keys will not match so set to null before comparing
        ivc_vk.eccvm->pcs_verification_key = VerifierCommitmentKey<curve::Grumpkin>();

        return ivc_vk;
    };

    auto civc_vk_nominal = generate_vk(MIN_NUM_CIRCUITS, log2_num_gates_nominal);
    auto civc_vk_overflow = generate_vk(MIN_NUM_CIRCUITS, log2_num_gates_overflow);

    // Check the equality of the Mega components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_nominal.mega.get(), *civc_vk_overflow.mega.get());

    // Check the equality of the ECCVM components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_nominal.eccvm.get(), *civc_vk_overflow.eccvm.get());

    // Check the equality of the Translator components of the ClientIVC VKeys.
    EXPECT_EQ(*civc_vk_nominal.translator.get(), *civc_vk_overflow.translator.get());
};

/**
 * @brief Test that running the benchmark suite with mocked verification keys will not error out.
 */
HEAVY_TEST(ClientIVCBenchValidation, Full6MockedVKs)
{
    const auto run_test = []() {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

        const size_t total_num_circuits{ 12 };
        ClientIVC ivc{ total_num_circuits, { AZTEC_TRACE_STRUCTURE } };
        PrivateFunctionExecutionMockCircuitProducer circuit_producer;
        auto mocked_vks = mock_vks(total_num_circuits);
        perform_ivc_accumulation_rounds(total_num_circuits, ivc, mocked_vks, /* mock_vk */ true);
        auto proof = ivc.prove();
        verify_ivc(proof, ivc);
    };
    ASSERT_NO_FATAL_FAILURE(run_test());
}

HEAVY_TEST(ClientIVCKernelCapacity, MaxCapacityPassing)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    const size_t total_num_circuits{ 2 * MAX_NUM_KERNELS };
    ClientIVC ivc{ total_num_circuits, { AZTEC_TRACE_STRUCTURE } };
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    for (size_t j = 0; j < total_num_circuits; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }
    auto proof = ivc.prove();
    bool verified = verify_ivc(proof, ivc);
    EXPECT_TRUE(verified);
}

HEAVY_TEST(ClientIVCKernelCapacity, MaxCapacityFailing)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    const size_t total_num_circuits{ 2 * (MAX_NUM_KERNELS + 1) };
    ClientIVC ivc{ total_num_circuits, { AZTEC_TRACE_STRUCTURE } };
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;
    for (size_t j = 0; j < total_num_circuits; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }
    EXPECT_ANY_THROW(ivc.prove());
}

/**
 * @brief Test use of structured trace overflow block mechanism
 * @details Accumulate 4 circuits which have progressively more arithmetic gates. The final two overflow the
 prescribed
 * arithmetic block size and make use of the overflow block which has sufficient capacity.
 *
 */
TEST_F(ClientIVCTests, StructuredTraceOverflow)
{

    // Define trace settings with sufficient overflow capacity to accommodate each of the circuits to be accumulated

    ClientIVC ivc{ MIN_NUM_CIRCUITS, { SMALL_TEST_STRUCTURE, /*overflow_capacity=*/1 << 17 } };
    TestSettings settings;
    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    // Construct and accumulate some circuits of varying size
    size_t log2_num_gates = 14;
    for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
        settings.log2_num_gates = log2_num_gates;
        circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        log2_num_gates += 1;
    }

    EXPECT_TRUE(ivc.prove_and_verify());
};

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
        { "Case 1", { 18, 14, 14, 14 } }, /* first circuit overflows with dyadic size increase */
        { "Case 2", { 14, 18, 14, 16 } }, /* dyadic size overflow then simple overflow */
        { "Case 3", { 14, 16, 14, 18 } }, /* simple overflow then dyadic size overflow */
    };

    for (const auto& test : test_cases) {
        SCOPED_TRACE(test.name); // improves test output readability

        uint32_t overflow_capacity = 0;
        ClientIVC ivc{ MIN_NUM_CIRCUITS, { SMALL_TEST_STRUCTURE_FOR_OVERFLOWS, overflow_capacity } };
        PrivateFunctionExecutionMockCircuitProducer circuit_producer;

        // Accumulate
        for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(
                ivc, { .log2_num_gates = test.log2_num_arith_gates[idx] });
        }

        EXPECT_EQ(check_accumulator_target_sum_manual(ivc.fold_output.accumulator), true);
        EXPECT_TRUE(ivc.prove_and_verify());
    }
}

/**
 * @brief Test methods for serializing and deserializing a proof to/from a file in msgpack format
 *
 */
TEST_F(ClientIVCTests, MsgpackProofFromFile)
{
    ClientIVC ivc{ MIN_NUM_CIRCUITS };

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }

    const auto proof = ivc.prove();

    // Serialize/deserialize the proof to/from a file as proof-of-concept
    const std::string filename = "proof.msgpack";
    proof.to_file_msgpack(filename);
    auto proof_deserialized = ClientIVC::Proof::from_file_msgpack(filename);

    EXPECT_TRUE(ivc.verify(proof_deserialized));
};

/**
 * @brief Test methods for serializing and deserializing a proof to/from a "heap" buffer in msgpack format
 *
 */
TEST_F(ClientIVCTests, MsgpackProofFromBuffer)
{
    ClientIVC ivc{ MIN_NUM_CIRCUITS };

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }

    const auto proof = ivc.prove();

    // Serialize/deserialize proof to/from a heap buffer, check that it verifies
    uint8_t* buffer = proof.to_msgpack_heap_buffer();
    auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);
    uint8_t const* uint8_ptr = uint8_buffer.data();
    auto proof_deserialized = ClientIVC::Proof::from_msgpack_buffer(uint8_ptr);
    EXPECT_TRUE(ivc.verify(proof_deserialized));
    aligned_free(buffer);
};

/**
 * @brief Check that a CIVC proof can be serialized and deserialized via msgpack and that attempting to deserialize
 * a random buffer of bytes fails gracefully with a type error
 */
TEST_F(ClientIVCTests, RandomProofBytes)
{
    ClientIVC ivc{ MIN_NUM_CIRCUITS };

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    for (size_t idx = 0; idx < MIN_NUM_CIRCUITS; ++idx) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }

    const auto proof = ivc.prove();

    // Serialize/deserialize proof to msgpack buffer, check that it verifies
    msgpack::sbuffer buffer = proof.to_msgpack_buffer();
    auto proof_deserialized = ClientIVC::Proof::from_msgpack_buffer(buffer);
    EXPECT_TRUE(ivc.verify(proof_deserialized));

    // Overwrite the buffer with random bytes for testing failure case
    {
        std::vector<uint8_t> random_bytes(buffer.size());
        std::generate(random_bytes.begin(), random_bytes.end(), []() { return static_cast<uint8_t>(rand() % 256); });
        std::copy(random_bytes.begin(), random_bytes.end(), buffer.data());
    }

    // Expect deserialization to fail with error msgpack::v1::type_error with description "std::bad_cast"
    EXPECT_THROW(ClientIVC::Proof::from_msgpack_buffer(buffer), msgpack::v1::type_error);
};

/**
 * @brief Accumulate a set of circuits that includes consecutive kernels
 * @details In practice its common to have multiple consecutive kernels without intermittent apps e.g. an inner followed
 * immediately by a reset, or an inner-reset-tail sequence. This test ensures that such cases are handled correctly.
 *
 */
TEST_F(ClientIVCTests, ConsecutiveKernels)
{
    const size_t NUM_CIRCUITS = 6;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    // Accumulate a series of mocked circuits (app, kernel, app, kernel)
    for (size_t idx = 0; idx < NUM_CIRCUITS - 2; ++idx) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc);
    }

    // Cap the IVC with two more kernels (say, a 'reset' and a 'tail') without intermittent apps
    circuit_producer.construct_and_accumulate_next_circuit(ivc, { .force_is_kernel = true });
    circuit_producer.construct_and_accumulate_next_circuit(ivc, { .force_is_kernel = true });

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
TEST_F(ClientIVCTests, DatabusFailure)
{
    size_t NUM_CIRCUITS = 6;
    ClientIVC ivc{ NUM_CIRCUITS, { AZTEC_TRACE_STRUCTURE } };

    PrivateFunctionExecutionMockCircuitProducer circuit_producer;

    // Construct and accumulate a series of mocked private function execution circuits
    for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
        auto [circuit, vk] = circuit_producer.create_next_circuit_and_vk(ivc);

        // Tamper with the return data of the second app circuit before it is processed as input to the next kernel
        if (idx == 2) {
            circuit_producer.tamper_with_databus();
        }

        ivc.accumulate(circuit, vk);
        if (ivc.num_circuits_accumulated == NUM_CIRCUITS) {
            circuit_producer.construct_hiding_kernel(ivc);
        }
    }

    EXPECT_FALSE(ivc.prove_and_verify());
};
