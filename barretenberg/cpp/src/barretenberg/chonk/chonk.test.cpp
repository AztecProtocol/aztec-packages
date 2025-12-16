#include <ranges>

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/test_bench_shared.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs_test_serde.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "gtest/gtest.h"

using namespace bb;

static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;

class ChonkTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using Flavor = Chonk::Flavor;
    using FF = typename Flavor::FF;
    using Commitment = Flavor::Commitment;
    using VerificationKey = Flavor::VerificationKey;
    using Builder = Chonk::ClientCircuit;
    using ProverInstance = Chonk::ProverInstance;
    using VerifierInstance = Chonk::VerifierInstance;
    using DeciderProver = Chonk::DeciderProver;
    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

  public:
    /**
     * @brief Tamper with a proof
     * @details The first value in the proof after the public inputs is the commitment to the wire w.l (see
     * OinkProver). We modify the commitment by adding Commitment::one().
     *
     */
    static void tamper_with_proof(HonkProof& proof, size_t public_inputs_offset)
    {
        // Tamper with the commitment in the proof
        Commitment commitment = FrCodec::deserialize_from_fields<Commitment>(
            std::span{ proof }.subspan(public_inputs_offset, FrCodec::template calc_num_fields<Commitment>()));
        commitment = commitment + Commitment::one();
        auto commitment_frs = FrCodec::serialize_to_fields<Commitment>(commitment);
        for (size_t idx = 0; idx < 4; ++idx) {
            proof[public_inputs_offset + idx] = commitment_frs[idx];
        }
    }

    static std::pair<Chonk::Proof, Chonk::VerificationKey> accumulate_and_prove_ivc(size_t num_app_circuits,
                                                                                    TestSettings settings = {},
                                                                                    bool check_circuit_sizes = false)
    {
        CircuitProducer circuit_producer(num_app_circuits);
        const size_t num_circuits = circuit_producer.total_num_circuits;
        Chonk ivc{ num_circuits };

        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings, check_circuit_sizes);
        }
        return { ivc.prove(), ivc.get_vk() };
    };

    /**
     * @brief Enum for specifying which KernelIO field to tamper with in tests
     */
    enum class KernelIOField { PAIRING_INPUTS, ACCUMULATOR_HASH, KERNEL_RETURN_DATA, APP_RETURN_DATA, ECC_OP_TABLES };

    /**
     * @brief Enum for specifying which HidingKernelIO field to test for propagation consistency
     */
    enum class HidingKernelIOField { PAIRING_INPUTS, KERNEL_RETURN_DATA, ECC_OP_TABLES };

    /**
     * @brief Helper function to test tampering with AppIO pairing inputs
     * @details Accumulates circuits, doubles the app pairing points (creating valid but different points),
     * and verifies that the final Chonk proof fails verification.
     */
    static void test_app_io_tampering()
    {
        BB_DISABLE_ASSERTS();

        const size_t NUM_APP_CIRCUITS = 2;
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto [circuit, vk] = circuit_producer.create_next_circuit_and_vk(ivc, settings);
            ivc.accumulate(circuit, vk);

            // After accumulating 3 circuits (app, kernel, app), we have 2 proofs in the queue
            if (idx == 2) {
                EXPECT_EQ(ivc.verification_queue.size(), 2);

                auto& app_entry = ivc.verification_queue[1];
                ASSERT_FALSE(app_entry.is_kernel) << "Expected second queue entry to be an app";

                using AppIOSerde = bb::stdlib::recursion::honk::AppIOSerde;
                size_t num_public_inputs = app_entry.honk_vk->num_public_inputs;
                AppIOSerde app_io = AppIOSerde::from_proof(app_entry.proof, num_public_inputs);

                // Double the pairing points (multiply by 2) - creates valid but different points
                app_io.pairing_inputs.P0 = app_io.pairing_inputs.P0 + app_io.pairing_inputs.P0;
                app_io.pairing_inputs.P1 = app_io.pairing_inputs.P1 + app_io.pairing_inputs.P1;

                EXPECT_TRUE(app_io.pairing_inputs.check());

                app_io.to_proof(app_entry.proof, num_public_inputs);
            }
        }

        auto proof = ivc.prove();
        EXPECT_FALSE(Chonk::verify(proof, ivc.get_vk()));
    }

    /**
     * @brief Helper function to test tampering with KernelIO fields
     * @details Accumulates circuits, tampers with the specified field in the Init Kernel proof,
     * and verifies that the final Chonk proof fails verification.
     */
    static void test_kernel_io_tampering(KernelIOField field_to_tamper)
    {
        BB_DISABLE_ASSERTS();

        const size_t NUM_APP_CIRCUITS = 2;
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto [circuit, vk] = circuit_producer.create_next_circuit_and_vk(ivc, settings);
            ivc.accumulate(circuit, vk);

            // After accumulating 3 circuits (app, kernel, app), we have 2 proofs in the queue
            if (idx == 2) {
                EXPECT_EQ(ivc.verification_queue.size(), 2);

                auto& kernel_entry = ivc.verification_queue[0];
                ASSERT_TRUE(kernel_entry.is_kernel) << "Expected first queue entry to be a kernel";

                using KernelIOSerde = bb::stdlib::recursion::honk::KernelIOSerde;
                size_t num_public_inputs = kernel_entry.honk_vk->num_public_inputs;
                KernelIOSerde kernel_io = KernelIOSerde::from_proof(kernel_entry.proof, num_public_inputs);

                // Tamper with the specified field
                switch (field_to_tamper) {
                case KernelIOField::PAIRING_INPUTS: {
                    // Replace with valid default pairing points (different from actual accumulated values)
                    using namespace bb::stdlib::recursion;
                    kernel_io.pairing_inputs.P0 = Commitment(DEFAULT_PAIRING_POINTS_P0_X, DEFAULT_PAIRING_POINTS_P0_Y);
                    kernel_io.pairing_inputs.P1 = Commitment(DEFAULT_PAIRING_POINTS_P1_X, DEFAULT_PAIRING_POINTS_P1_Y);
                    EXPECT_TRUE(kernel_io.pairing_inputs.check());
                    break;
                }
                case KernelIOField::ACCUMULATOR_HASH:
                    kernel_io.output_hn_accum_hash += FF(1);
                    break;
                case KernelIOField::KERNEL_RETURN_DATA:
                    kernel_io.kernel_return_data = kernel_io.kernel_return_data + Commitment::one();
                    break;
                case KernelIOField::APP_RETURN_DATA:
                    kernel_io.app_return_data = kernel_io.app_return_data + Commitment::one();
                    break;
                case KernelIOField::ECC_OP_TABLES:
                    kernel_io.ecc_op_tables[0] = kernel_io.ecc_op_tables[0] + Commitment::one();
                    break;
                }

                kernel_io.to_proof(kernel_entry.proof, num_public_inputs);
            }
        }

        auto proof = ivc.prove();
        EXPECT_FALSE(Chonk::verify(proof, ivc.get_vk()));
    }

    /**
     * @brief Helper function to test HidingKernelIO field propagation consistency
     * @details Accumulates circuits, extracts the specified field from Tail kernel's proof,
     * generates the final proof (which creates HidingKernel), and verifies the field
     * propagated correctly to the HidingKernel's proof.
     *
     * Note: This test does not perform proof tampering. Changing the public inputs of HidingKernel
     * would lead to wrong challenges throughout the proof, so instead we verify that the expected
     * input from the Tail kernel matches the expected output in the HidingKernel.
     */
    static void test_hiding_kernel_io_propagation(HidingKernelIOField field_to_test)
    {
        using HidingKernelIOSerde = bb::stdlib::recursion::honk::HidingKernelIOSerde;

        const size_t NUM_APP_CIRCUITS = 2;
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        // Accumulate all circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            auto [circuit, vk] = circuit_producer.create_next_circuit_and_vk(ivc, settings);
            ivc.accumulate(circuit, vk);
        }

        // Extract field from Tail kernel's proof before prove() generates HidingKernel
        HidingKernelIOSerde tail_io;
        for (auto& it : std::ranges::reverse_view(ivc.verification_queue)) {
            if (it.is_kernel) {
                size_t num_public_inputs = it.honk_vk->num_public_inputs;
                ASSERT_EQ(num_public_inputs, HidingKernelIOSerde::PUBLIC_INPUTS_SIZE)
                    << "Tail kernel should use HidingKernelIO format";
                tail_io = HidingKernelIOSerde::from_proof(it.proof, num_public_inputs);
                break;
            }
        }

        // Generate the final proof (creates HidingKernel)
        auto proof = ivc.prove();
        auto vk = ivc.get_vk();

        // Extract field from HidingKernel's proof (final mega_proof)
        size_t hiding_kernel_pub_inputs = vk.mega->num_public_inputs;
        ASSERT_EQ(hiding_kernel_pub_inputs, HidingKernelIOSerde::PUBLIC_INPUTS_SIZE)
            << "HidingKernel should use HidingKernelIO format";
        HidingKernelIOSerde hiding_io = HidingKernelIOSerde::from_proof(proof.mega_proof, hiding_kernel_pub_inputs);

        // Verify field propagated correctly from Tail kernel to HidingKernel
        switch (field_to_test) {
        case HidingKernelIOField::PAIRING_INPUTS:
            EXPECT_EQ(tail_io.pairing_inputs.P0, hiding_io.pairing_inputs.P0)
                << "P0 mismatch: Tail has " << tail_io.pairing_inputs.P0 << " but HidingKernel has "
                << hiding_io.pairing_inputs.P0;
            EXPECT_EQ(tail_io.pairing_inputs.P1, hiding_io.pairing_inputs.P1)
                << "P1 mismatch: Tail has " << tail_io.pairing_inputs.P1 << " but HidingKernel has "
                << hiding_io.pairing_inputs.P1;
            break;
        case HidingKernelIOField::KERNEL_RETURN_DATA:
            EXPECT_EQ(tail_io.kernel_return_data, hiding_io.kernel_return_data)
                << "kernel_return_data mismatch: Tail has " << tail_io.kernel_return_data << " but HidingKernel has "
                << hiding_io.kernel_return_data;
            break;
        case HidingKernelIOField::ECC_OP_TABLES:
            for (size_t i = 0; i < tail_io.ecc_op_tables.size(); ++i) {
                EXPECT_EQ(tail_io.ecc_op_tables[i], hiding_io.ecc_op_tables[i])
                    << "M_tail[" << i << "] mismatch: Tail has " << tail_io.ecc_op_tables[i] << " but HidingKernel has "
                    << hiding_io.ecc_op_tables[i];
            }
            break;
        }
    }
};

/**
 * @brief Test sizes of the circuits generated by MockCircuitProducer
 *
 * @details The sizes of the circuits depends on the TestSettings:
 *  - No settings: first app is 2^19, all other apps are 2^17, all the kernels are 2^18
 *  - Settings: apps are 2^(log2_num_gates + 2), all kernels are smaller than 2^19
 */
TEST_F(ChonkTests, TestCircuitSizes)
{
    const size_t NUM_APP_CIRCUITS = 2;

    // Check circuit sizes when no settings are passed
    {
        auto [proof, vk] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, {}, true);
        EXPECT_TRUE(Chonk::verify(proof, vk));
    }

    // Check circuit sizes when no settings are passed
    {
        auto [proof, vk] =
            accumulate_and_prove_ivc(NUM_APP_CIRCUITS, { .log2_num_gates = SMALL_LOG_2_NUM_GATES }, true);
        EXPECT_TRUE(Chonk::verify(proof, vk));
    }
};

/**
 * @brief Test basic IVC.
 *
 * @note The circuits are of varying size: first circuit is 2^19, kernels are 2^18, apps are 2^17.
 *
 */
TEST_F(ChonkTests, Basic)
{
    const size_t NUM_APP_CIRCUITS = 2;
    auto [proof, vk] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS);

    EXPECT_TRUE(Chonk::verify(proof, vk));
};

/**
 * @brief Check that the IVC fails if an intermediate fold proof is invalid
 * @details When accumulating 4 circuits, there are 3 fold proofs to verify (the first two are recursively verfied and
 * the 3rd is verified as part of the IVC proof). Check that if any of one of these proofs is invalid, the IVC will
 * fail.
 *
 */
TEST_F(ChonkTests, BadProofFailure)
{
    BB_DISABLE_ASSERTS(); // Disable assert in HN prover

    const size_t NUM_APP_CIRCUITS = 2;
    // Confirm that the IVC verifies if nothing is tampered with
    {

        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        auto proof = ivc.prove();
        EXPECT_TRUE(Chonk::verify(proof, ivc.get_vk()));
    }

    // The IVC throws an exception if the FIRST fold proof is tampered with
    {
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };

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
        auto proof = ivc.prove();
        EXPECT_FALSE(Chonk::verify(proof, ivc.get_vk()));
    }

    // The IVC fails if the SECOND fold proof is tampered with
    {
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };

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
        auto proof = ivc.prove();
        EXPECT_FALSE(Chonk::verify(proof, ivc.get_vk()));
    }
};

/**
 * @brief Ensure that the Chonk VK is independent of the number of circuits accumulated
 *
 */
TEST_F(ChonkTests, VKIndependenceFromNumberOfCircuits)
{
    const TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    auto [unused_1, chonk_vk_1] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);
    auto [unused_2, chonk_vk_2] = accumulate_and_prove_ivc(/*num_app_circuits=*/3, settings);

    // Check the equality of the Mega components of the Chonk VKeys.
    EXPECT_EQ(*chonk_vk_1.mega.get(), *chonk_vk_2.mega.get());

    // Check the equality of the ECCVM components of the Chonk VKeys.
    EXPECT_EQ(*chonk_vk_1.eccvm.get(), *chonk_vk_2.eccvm.get());

    // Check the equality of the Translator components of the Chonk VKeys.
    EXPECT_EQ(*chonk_vk_1.translator.get(), *chonk_vk_2.translator.get());
};

/**
 * @brief Ensure that the Chonk VK is independent of the sizes of the circuits being accumulated
 *
 */
TEST_F(ChonkTests, VKIndependenceFromCircuitSize)
{
    // Run IVC for two sets of circuits
    const size_t NUM_APP_CIRCUITS = 1;
    const size_t log2_num_gates_small = 5;
    const size_t log2_num_gates_big = 18;

    const TestSettings settings_1{ .log2_num_gates = log2_num_gates_small };
    const TestSettings settings_2{ .log2_num_gates = log2_num_gates_big };

    auto [unused_1, chonk_vk_1] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, settings_1);
    auto [unused_2, chonk_vk_2] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, settings_2);

    // Check the equality of the Mega components of the Chonk VKeys.
    EXPECT_EQ(*chonk_vk_1.mega.get(), *chonk_vk_2.mega.get());

    // Check the equality of the ECCVM components of the Chonk VKeys.
    EXPECT_EQ(*chonk_vk_1.eccvm.get(), *chonk_vk_2.eccvm.get());

    // Check the equality of the Translator components of the Chonk VKeys.
    EXPECT_EQ(*chonk_vk_1.translator.get(), *chonk_vk_2.translator.get());
};

/**
 * @brief Test to establish the "max" number of apps that can be accumulated due to limitations on the ECCVM size
 *
 */
HEAVY_TEST(ChonkKernelCapacity, MaxCapacityPassing)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    const size_t NUM_APP_CIRCUITS = 17;
    auto [proof, vk] = ChonkTests::accumulate_and_prove_ivc(NUM_APP_CIRCUITS);

    bool verified = Chonk::verify(proof, vk);
    EXPECT_TRUE(verified);
};

/**
 * @brief Test methods for serializing and deserializing a proof to/from a file/buffer in msgpack format
 *
 */
TEST_F(ChonkTests, MsgpackProofFromFileOrBuffer)
{
    // Generate an arbitrary valid CICV proof
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
    auto [proof, vk] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);

    { // Serialize/deserialize the proof to/from a file, check that it verifies
        const std::string filename = "proof.msgpack";
        proof.to_file_msgpack(filename);
        auto proof_deserialized = Chonk::Proof::from_file_msgpack(filename);

        EXPECT_TRUE(Chonk::verify(proof_deserialized, vk));
    }

    { // Serialize/deserialize proof to/from a heap buffer, check that it verifies
        uint8_t* buffer = proof.to_msgpack_heap_buffer();
        auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);
        uint8_t const* uint8_ptr = uint8_buffer.data();
        auto proof_deserialized = Chonk::Proof::from_msgpack_buffer(uint8_ptr);

        EXPECT_TRUE(Chonk::verify(proof_deserialized, vk));
    }

    { // Check that attempting to deserialize a proof from a buffer with random bytes fails gracefully
        msgpack::sbuffer buffer = proof.to_msgpack_buffer();
        auto proof_deserialized = Chonk::Proof::from_msgpack_buffer(buffer);
        EXPECT_TRUE(Chonk::verify(proof_deserialized, vk));

        std::vector<uint8_t> random_bytes(buffer.size());
        std::generate(random_bytes.begin(), random_bytes.end(), []() { return static_cast<uint8_t>(rand() % 256); });
        std::copy(random_bytes.begin(), random_bytes.end(), buffer.data());

        // Expect deserialization to fail with error msgpack::v1::type_error with description "std::bad_cast"
        EXPECT_THROW(Chonk::Proof::from_msgpack_buffer(buffer), msgpack::v1::type_error);
    }
};

/**
 * @brief Test that tampering with kernel pairing inputs causes verification to fail
 * @details Pairing points (P0, P1) accumulate across the IVC chain through aggregation.
 * Even if we replace them with pairing points satisfying pairing check, the public input binding should must catch it.
 */
TEST_F(ChonkTests, KernelPairingInputsTamperingFailure)
{
    ChonkTests::test_kernel_io_tampering(KernelIOField::PAIRING_INPUTS);
}

/**
 * @brief Test that tampering with app pairing inputs causes verification to fail
 * @details App circuits also output pairing points (AppIO). This test ensures that verification fails if we double
 * these pairing points.
 */
TEST_F(ChonkTests, AppPairingInputsTamperingFailure)
{
    ChonkTests::test_app_io_tampering();
}

/**
 * @brief Verify that tampering with the accumulator hash in public inputs causes IVC verification failure
 * @details Each kernel outputs `output_hn_accum_hash` as a public input. The next kernel computes the hash of its
 * input accumulator and compares it with the hash from the previous kernel's public inputs via assert_equal.
 * This test tampers with the hash to verify the binding.
 */
TEST_F(ChonkTests, AccumulatorHashTamperingFailure)
{
    ChonkTests::test_kernel_io_tampering(KernelIOField::ACCUMULATOR_HASH);
}

/**
 * @brief Test that tampering with kernel_return_data causes verification to fail
 * @details kernel_return_data is the commitment to the kernel's return data which must match
 * the calldata commitment of the next circuit. Tampering should cause databus consistency check to fail.
 */
TEST_F(ChonkTests, KernelReturnDataTamperingFailure)
{
    ChonkTests::test_kernel_io_tampering(KernelIOField::KERNEL_RETURN_DATA);
}

/**
 * @brief Test that tampering with app_return_data causes verification to fail
 * @details app_return_data is the commitment to the app's return data which must match
 * the secondary_calldata commitment of the next circuit.
 */
TEST_F(ChonkTests, AppReturnDataTamperingFailure)
{
    ChonkTests::test_kernel_io_tampering(KernelIOField::APP_RETURN_DATA);
}

/**
 * @brief Test that tampering with ecc_op_tables causes verification to fail
 * @details ecc_op_tables contains commitments to merged ECC operation tables (T_prev).
 * Tampering causes the recursive merge verification to fail.
 */
TEST_F(ChonkTests, EccOpTablesTamperingFailure)
{
    ChonkTests::test_kernel_io_tampering(KernelIOField::ECC_OP_TABLES);
}

/**
 * @brief Test that pairing points are consistently propagated from Tail kernel to HidingKernel proof
 * @details Pairing points (P0, P1) accumulate across all circuits in the IVC chain via aggregation.
 * The aggregated pairing points are placed in the Tail kernel's public inputs and must be
 * propagated unchanged to the HidingKernel's public inputs.
 */
TEST_F(ChonkTests, PairingPointsPropagationConsistency)
{
    ChonkTests::test_hiding_kernel_io_propagation(HidingKernelIOField::PAIRING_INPUTS);
}

/**
 * @brief Test that kernel_return_data is consistently propagated from Tail kernel to HidingKernel proof
 * @details kernel_return_data commitment is placed in the Tail kernel's public inputs and must be
 * propagated unchanged to the HidingKernel's public inputs.
 */
TEST_F(ChonkTests, KernelReturnDataPropagationConsistency)
{
    ChonkTests::test_hiding_kernel_io_propagation(HidingKernelIOField::KERNEL_RETURN_DATA);
}

/**
 * @brief Test that M_tail is consistently propagated from Tail kernel to HidingKernel proof
 * @details M_tail (ecc_op_tables) commitments are placed in the Tail kernel's public inputs and must be
 * propagated unchanged to the HidingKernel's public inputs.
 */
TEST_F(ChonkTests, MTailPropagationConsistency)
{
    ChonkTests::test_hiding_kernel_io_propagation(HidingKernelIOField::ECC_OP_TABLES);
}
