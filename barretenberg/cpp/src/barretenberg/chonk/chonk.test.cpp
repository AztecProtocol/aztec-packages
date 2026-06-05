#include <functional>
#include <ranges>
#include <sys/resource.h>

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/chonk/proof_compression.hpp"
#include "barretenberg/chonk/test_bench_shared.hpp"
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/goblin/goblin.hpp"
#include "barretenberg/goblin/mock_circuits.hpp"
#include "barretenberg/honk/proof_length.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs_test_serde.hpp"
#include "barretenberg/stdlib_circuit_builders/mega_circuit_builder.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#include "gtest/gtest.h"

using namespace bb;

namespace {

constexpr size_t SMALL_LOG_2_NUM_GATES = 5;

/**
 * @brief Enum for specifying which KernelIO field to tamper with in tests.
 */
enum class KernelIOField : uint8_t {
    PAIRING_INPUTS,
    ACCUMULATOR_HASH,
    KERNEL_RETURN_DATA,
    APP_RETURN_DATA,
    ECC_OP_HASH
};

} // namespace

class ChonkTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using FF = Chonk::FF;
    using Commitment = Chonk::Commitment;
    using Builder = Chonk::ClientCircuit;
    using DeciderProver = Chonk::DeciderProver;
    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;
    using ChonkVerifier = ChonkNativeVerifier;

  public:
    /**
     * @brief Hook fired after each accumulate() inside run_ivc.
     */
    using AccumulateHook = std::function<void(Chonk&, size_t)>;

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

    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> run_ivc(
        size_t num_app_circuits,
        TestSettings settings = {},
        const AccumulateHook& post_hook = nullptr,
        bool check_circuit_sizes = false)
    {
        CircuitProducer circuit_producer(num_app_circuits);
        return run_ivc_impl(circuit_producer, settings, post_hook, check_circuit_sizes);
    };

    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> run_ivc(
        std::vector<bool> leading_is_kernel_flags,
        TestSettings settings = {},
        const AccumulateHook& post_hook = nullptr,
        bool check_circuit_sizes = false)
    {
        CircuitProducer circuit_producer(std::move(leading_is_kernel_flags), /*large_first_app=*/false);
        return run_ivc_impl(circuit_producer, settings, post_hook, check_circuit_sizes);
    };

    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> accumulate_and_prove_ivc(
        size_t num_app_circuits, TestSettings settings = {}, bool check_circuit_sizes = false)
    {
        return run_ivc(num_app_circuits, settings, /*post_hook=*/nullptr, check_circuit_sizes);
    };

    static bool verify_chonk(const ChonkProof& proof, const std::shared_ptr<MegaZKFlavor::VKAndHash>& vk_and_hash)
    {
        ChonkVerifier verifier(vk_and_hash);
        return verifier.verify(proof);
    }

    /**
     * @brief Helper function to test tampering with AppIO pairing inputs
     * @details Accumulates circuits, changes the app pairing points (creating valid but different points),
     * and verifies that the final Chonk proof fails verification.
     */
    static void test_app_io_tampering()
    {
        BB_DISABLE_ASSERTS();

        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
        auto [proof, vk] = run_ivc(/*num_app_circuits=*/2, settings, [](Chonk& ivc, size_t idx) {
            if (idx == 1) {
                auto& app_entry = ivc.verification_queue[1];
                ASSERT_FALSE(app_entry.is_kernel()) << "Expected second queue entry to be an app";

                using AppIOSerde = bb::stdlib::recursion::honk::AppIOSerde;
                size_t num_public_inputs = app_entry.num_public_inputs();
                AppIOSerde app_io = AppIOSerde::from_proof(app_entry.proof, num_public_inputs);

                // Set P0 to [x]₁ (the first SRS point after [1]) and P1 to [1]₁
                app_io.pairing_inputs.P0() = srs::get_crs_factory<curve::BN254>()->get_crs(2)->get_monomial_points()[1];
                app_io.pairing_inputs.P1() = -Commitment::one();

                EXPECT_TRUE(app_io.pairing_inputs.check());

                app_io.to_proof(app_entry.proof, num_public_inputs);
            }
        });
        EXPECT_FALSE(verify_chonk(proof, vk));
    }

    /**
     * @brief Helper function to test tampering with KernelIO fields
     * @details Accumulates circuits, tampers with the specified field in the Init Kernel proof,
     * and verifies that the final Chonk proof fails verification.
     */
    static void test_kernel_io_tampering(KernelIOField field_to_tamper)
    {
        BB_DISABLE_ASSERTS();

        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
        auto [proof, vk] = run_ivc(/*num_app_circuits=*/4, settings, [field_to_tamper](Chonk& ivc, size_t idx) {
            if (idx == 3) {
                auto& kernel_entry = ivc.verification_queue[0];
                ASSERT_TRUE(kernel_entry.is_kernel()) << "Expected first queue entry to be a kernel";

                using KernelIOSerde = bb::stdlib::recursion::honk::KernelIOSerde;
                size_t num_public_inputs = kernel_entry.num_public_inputs();
                KernelIOSerde kernel_io = KernelIOSerde::from_proof(kernel_entry.proof, num_public_inputs);

                // Tamper with the specified field
                switch (field_to_tamper) {
                case KernelIOField::PAIRING_INPUTS: {
                    // Set P0 to [x]₁ (the first SRS point after [1]) and P1 to [1]₁
                    kernel_io.pairing_inputs.P0() =
                        srs::get_crs_factory<curve::BN254>()->get_crs(2)->get_monomial_points()[1];
                    kernel_io.pairing_inputs.P1() = -Commitment::one();

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
                    kernel_io.app_return_data[0] = kernel_io.app_return_data[0] + Commitment::one();
                    break;
                case KernelIOField::ECC_OP_HASH:
                    kernel_io.ecc_op_hash += FF(1);
                    break;
                }

                kernel_io.to_proof(kernel_entry.proof, num_public_inputs);
            }
        });
        EXPECT_FALSE(verify_chonk(proof, vk));
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
    static void test_kernel_return_data_propagation()
    {
        using HidingKernelIOSerde = bb::stdlib::recursion::honk::HidingKernelIOSerde;
        using KernelIOSerde = bb::stdlib::recursion::honk::KernelIOSerde;

        const size_t NUM_APP_CIRCUITS = 2;
        const size_t NUM_TOTAL_CIRCUITS =
            NUM_APP_CIRCUITS + static_cast<size_t>(ceil(static_cast<double>(NUM_APP_CIRCUITS) / MAX_APPS_PER_KERNEL)) +
            /*num_trailing_kernels*/ 3;
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

        // Extract tail kernel IO before the hiding kernel consumes the verification queue.
        KernelIOSerde tail_io;
        auto [proof, vk_and_hash] = run_ivc(
            /*num_app_circuits=*/NUM_APP_CIRCUITS, settings, [&tail_io, &NUM_TOTAL_CIRCUITS](Chonk& ivc, size_t idx) {
                // With 2 apps the layout is [app, kernel, app, kernel, reset, tail, hiding].
                if (idx == NUM_TOTAL_CIRCUITS - 2) {
                    for (auto& it : std::ranges::reverse_view(ivc.verification_queue)) {
                        if (it.is_kernel()) {
                            size_t num_public_inputs = it.num_public_inputs();
                            ASSERT_EQ(num_public_inputs, KernelIOSerde::PUBLIC_INPUTS_SIZE)
                                << "Tail kernel should use KernelIO format";
                            ASSERT_GT(it.proof.size(), num_public_inputs) << "Tail kernel proof too small";
                            tail_io = KernelIOSerde::from_proof(it.proof, num_public_inputs);
                            break;
                        }
                    }
                }
            });

        size_t hiding_kernel_pub_inputs = vk_and_hash->vk->num_public_inputs;
        ASSERT_EQ(hiding_kernel_pub_inputs, HidingKernelIOSerde::PUBLIC_INPUTS_SIZE)
            << "HidingKernel should use HidingKernelIO format";
        HidingKernelIOSerde hiding_io =
            HidingKernelIOSerde::from_proof(proof.hiding_oink_proof, hiding_kernel_pub_inputs);

        EXPECT_EQ(tail_io.kernel_return_data, hiding_io.kernel_return_data)
            << "kernel_return_data mismatch: Tail has " << tail_io.kernel_return_data << " but HidingKernel has "
            << hiding_io.kernel_return_data;
    }

  private:
    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> run_ivc_impl(
        CircuitProducer& circuit_producer,
        TestSettings settings,
        const AccumulateHook& post_hook,
        bool check_circuit_sizes)
    {
        const size_t num_circuits = circuit_producer.total_num_circuits;
        Chonk ivc{ num_circuits };

        for (size_t idx = 0; idx < num_circuits; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings, check_circuit_sizes);
            if (post_hook) {
                post_hook(ivc, idx);
            }
        }
        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }
};

/**
 * @brief Test sizes of the circuits generated by MockCircuitProducer
 *
 * @details The sizes of the circuits depends on the TestSettings:
 *  - No settings: first app is 2^19, all other apps are 2^17, init kernel is 2^17, inner kernels are 2^18
 *  - Settings: apps are 2^(log2_num_gates + 2), all kernels are smaller than 2^19
 */
TEST_F(ChonkTests, TestCircuitSizes)
{
    const size_t NUM_APP_CIRCUITS = 2;

    // Check circuit sizes when no settings are passed
    {
        auto [proof, vk] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, {}, true);
        EXPECT_TRUE(verify_chonk(proof, vk));
    }

    // Check circuit sizes when no settings are passed
    {
        auto [proof, vk] =
            accumulate_and_prove_ivc(NUM_APP_CIRCUITS, { .log2_num_gates = SMALL_LOG_2_NUM_GATES }, true);
        EXPECT_TRUE(verify_chonk(proof, vk));
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

    EXPECT_TRUE(verify_chonk(proof, vk));
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
        EXPECT_TRUE(verify_chonk(proof, ivc.get_hiding_kernel_vk_and_hash()));
    }

    // The IVC throws an exception if the FIRST fold proof is tampered with
    {
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, { .log2_num_gates = SMALL_LOG_2_NUM_GATES });

            if (idx == 2) {
                tamper_with_proof(ivc.verification_queue[0].proof,
                                  ivc.verification_queue[0].num_public_inputs()); // tamper with first proof
            }
        }
        auto proof = ivc.prove();
        EXPECT_FALSE(verify_chonk(proof, ivc.get_hiding_kernel_vk_and_hash()));
    }

    // The IVC fails if the SECOND fold proof is tampered with
    {
        CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
        const size_t NUM_CIRCUITS = circuit_producer.total_num_circuits;
        Chonk ivc{ NUM_CIRCUITS };

        // Construct and accumulate a set of mocked private function execution circuits
        for (size_t idx = 0; idx < NUM_CIRCUITS; ++idx) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, { .log2_num_gates = SMALL_LOG_2_NUM_GATES });

            if (idx == 1) {
                tamper_with_proof(ivc.verification_queue[1].proof,
                                  ivc.verification_queue[1].num_public_inputs()); // tamper with second proof
            }
        }
        auto proof = ivc.prove();
        EXPECT_FALSE(verify_chonk(proof, ivc.get_hiding_kernel_vk_and_hash()));
    }
};

/**
 * @brief Ensure that the hiding kernel VK is independent of the number of circuits accumulated
 *
 */
TEST_F(ChonkTests, VKIndependenceFromNumberOfCircuits)
{
    const TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    auto [unused_1, vk_and_hash_1] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);
    auto [unused_2, vk_and_hash_2] = accumulate_and_prove_ivc(/*num_app_circuits=*/3, settings);

    // Check the equality of the hiding kernel VKeys
    EXPECT_EQ(*vk_and_hash_1->vk.get(), *vk_and_hash_2->vk.get());
};

/**
 * @brief Ensure that the hiding kernel VK is independent of the sizes of the circuits being accumulated
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

    auto [unused_1, vk_and_hash_1] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, settings_1);
    auto [unused_2, vk_and_hash_2] = accumulate_and_prove_ivc(NUM_APP_CIRCUITS, settings_2);

    // Check the equality of the hiding kernel VKeys
    EXPECT_EQ(*vk_and_hash_1->vk.get(), *vk_and_hash_2->vk.get());
};

/**
 * @brief Test to establish the "max" number of apps that can be accumulated due to limitations on the ECCVM size
 *
 */
#ifdef NDEBUG
HEAVY_TEST(ChonkKernelCapacity, MaxCapacityPassing)
{
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());

    auto [proof, vk] = ChonkTests::accumulate_and_prove_ivc(CHONK_MAX_NUM_APPS);

    bool verified = ChonkTests::verify_chonk(proof, vk);
    EXPECT_TRUE(verified);
};
#endif

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
        auto proof_deserialized = ChonkProof::from_file_msgpack(filename);

        EXPECT_TRUE(verify_chonk(proof_deserialized, vk));
    }

    { // Serialize/deserialize proof to/from a heap buffer, check that it verifies
        uint8_t* buffer = proof.to_msgpack_heap_buffer();
        auto uint8_buffer = from_buffer<std::vector<uint8_t>>(buffer);
        uint8_t const* uint8_ptr = uint8_buffer.data();
        auto proof_deserialized = ChonkProof::from_msgpack_buffer(uint8_ptr);

        EXPECT_TRUE(verify_chonk(proof_deserialized, vk));
    }

    { // Check that attempting to deserialize a proof from a buffer with random bytes fails gracefully
        msgpack::sbuffer buffer = proof.to_msgpack_buffer();
        auto proof_deserialized = ChonkProof::from_msgpack_buffer(buffer);
        EXPECT_TRUE(verify_chonk(proof_deserialized, vk));

        std::vector<uint8_t> random_bytes(buffer.size());
        std::generate(random_bytes.begin(), random_bytes.end(), []() { return static_cast<uint8_t>(rand() % 256); });
        std::copy(random_bytes.begin(), random_bytes.end(), buffer.data());

        // Expect deserialization to fail (either msgpack parse error, type mismatch, trailing data,
        // or non-canonical field encoding)
        EXPECT_ANY_THROW(ChonkProof::from_msgpack_buffer(buffer));
    }
};

class KernelIOTamperingTests : public ChonkTests, public testing::WithParamInterface<KernelIOField> {};

/**
 * @brief Test that tampering with app pairing inputs causes verification to fail
 * @details App circuits also output pairing points (AppIO). This test ensures that verification fails if we double
 * these pairing points.
 */
TEST_F(ChonkTests, AppPairingInputsTamperingFailure)
{
    ChonkTests::test_app_io_tampering();
}

TEST_P(KernelIOTamperingTests, CausesVerificationFailure)
{
    test_kernel_io_tampering(GetParam());
}

INSTANTIATE_TEST_SUITE_P(All,
                         KernelIOTamperingTests,
                         testing::Values(KernelIOField::PAIRING_INPUTS,
                                         KernelIOField::ACCUMULATOR_HASH,
                                         KernelIOField::KERNEL_RETURN_DATA,
                                         KernelIOField::APP_RETURN_DATA,
                                         KernelIOField::ECC_OP_HASH),
                         [](const testing::TestParamInfo<KernelIOField>& info) {
                             switch (info.param) {
                             case KernelIOField::PAIRING_INPUTS:
                                 return "PairingInputs";
                             case KernelIOField::ACCUMULATOR_HASH:
                                 return "AccumulatorHash";
                             case KernelIOField::KERNEL_RETURN_DATA:
                                 return "KernelReturnData";
                             case KernelIOField::APP_RETURN_DATA:
                                 return "AppReturnData";
                             case KernelIOField::ECC_OP_HASH:
                                 return "EccOpHash";
                             }
                             return "Unknown";
                         });

/**
 * @brief Test that kernel_return_data is consistently propagated from Tail kernel to HidingKernel proof
 * @details kernel_return_data commitment is placed in the Tail kernel's public inputs and must be
 * propagated unchanged to the HidingKernel's public inputs.
 */
TEST_F(ChonkTests, KernelReturnDataPropagationConsistency)
{
    ChonkTests::test_kernel_return_data_propagation();
}

/**
 * @brief Demonstrates that the HN accumulator chain cannot be broken
 *
 * @details We construct a Chonk instance using a first app with 1 << SMALL_LOG_2_NUM_GATES gates, accumulate it to get
 * a valid accumulator, then construct another Chonk instance where we accumulate a first app with 1 <<
 * (SMALL_LOG_2_NUM_GATES + 1) gates but substitute the accumulator after the first accumulation. We then check
 * that the final proof fails verification, demonstrating that the accumulator is bound to the circuits that were
 * accumulated and cannot be substituted with an accumulator from a different execution trace.
 */
TEST_F(ChonkTests, AccumulatorBinding)
{
    BB_DISABLE_ASSERTS();

    TestSettings settings_one{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };

    // ── Step 1: Run a parallel VALID IVC to capture a valid accumulator ──────
    // We need a valid accumulator after the first app (circuit_index=0).

    const size_t num_app_circuits = 5;
    CircuitProducer producer_one(num_app_circuits);
    const size_t num_circuits = producer_one.total_num_circuits;
    Chonk chonk_one{ num_circuits };

    // Accumulate only the first circuit (app_0) to capture the valid accumulator
    producer_one.construct_and_accumulate_next_circuit(chonk_one, settings_one);
    auto valid_accumulator_after_app0 = chonk_one.prover_accumulator;

    // ── Step 2: Run the IVC with an INVALID first app + accumulator substitution ─

    MockDatabusProducer mock_databus;
    Chonk invalid_chonk{ num_circuits };
    CircuitProducer producer_two(num_app_circuits);
    TestSettings settings_two{ .log2_num_gates = SMALL_LOG_2_NUM_GATES + 1 };

    for (size_t circuit_idx = 0; circuit_idx < num_circuits; ++circuit_idx) {
        producer_two.construct_and_accumulate_next_circuit(invalid_chonk, settings_two);

        // *** ACCUMULATOR SUBSTITUTION ***
        // After the first app is accumulated, replace prover_accumulator with another one.
        if (circuit_idx == 0) {
            BB_ASSERT_NEQ(valid_accumulator_after_app0.non_shifted_commitment,
                          invalid_chonk.prover_accumulator.non_shifted_commitment,
                          "Accumulators should be different.");
            invalid_chonk.prover_accumulator = valid_accumulator_after_app0;
        }
    }

    // ── Step 3: prove and verify ─────────────────────────────────────────────
    auto proof = invalid_chonk.prove();
    auto vk_and_hash = invalid_chonk.get_hiding_kernel_vk_and_hash();
    ChonkVerifier verifier(vk_and_hash);
    auto result = verifier.verify(proof);

    EXPECT_FALSE(result) << "Substituting the accumulator should cause verification to fail, but it passed";
}

/**
 * @brief Measure peak memory during chonk proving with a single small (2^10) app circuit
 * @details Accumulates a single small app and measures the peak RSS increase during the prove() phase.
 * This isolates memory usage of the proving step when all accumulated apps are small.
 */
TEST_F(ChonkTests, SmallAppProvingMemory)
{
    auto get_peak_rss_mib = []() -> size_t {
        struct rusage usage{};
        getrusage(RUSAGE_SELF, &usage);
        return static_cast<size_t>(usage.ru_maxrss) / 1024; // Linux: ru_maxrss is in KB
    };

    constexpr size_t LOG2_NUM_GATES = 10;
    const size_t NUM_APP_CIRCUITS = 1;

    CircuitProducer circuit_producer(NUM_APP_CIRCUITS);
    const size_t num_circuits = circuit_producer.total_num_circuits;
    Chonk ivc{ num_circuits };
    TestSettings settings{ .log2_num_gates = LOG2_NUM_GATES };

    for (size_t j = 0; j < num_circuits; ++j) {
        circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
    }

    info("Peak RSS before prove: ", get_peak_rss_mib(), " MiB");

    ChonkProof proof = ivc.prove();

    info("Peak RSS after prove: ", get_peak_rss_mib(), " MiB");

    // Verify the proof is valid
    EXPECT_TRUE(verify_chonk(proof, ivc.get_hiding_kernel_vk_and_hash()));
}

TEST_F(ChonkTests, ProofCompressionRoundtrip)
{
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
    auto [proof, vk_and_hash] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);

    auto original_flat = proof.to_field_elements();
    info("Original proof size: ", original_flat.size(), " Fr elements (", original_flat.size() * 32, " bytes)");

    auto compressed = ProofCompressor::compress_chonk_proof(proof);
    double ratio = static_cast<double>(original_flat.size() * 32) / static_cast<double>(compressed.size());
    info("Compressed proof size: ", compressed.size(), " bytes");
    info("Compression ratio: ", ratio, "x");

    // Compression should achieve at least 1.5x (commitments 4 Fr → 32 bytes, scalars 1:1)
    EXPECT_GE(ratio, 1.5) << "Compression ratio " << ratio << "x is below the expected minimum of 1.5x";

    size_t mega_num_pub_inputs =
        proof.hiding_oink_proof.size() - ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;
    ChonkProof decompressed = ProofCompressor::decompress_chonk_proof(compressed, mega_num_pub_inputs);

    // Verify element-by-element roundtrip
    auto decompressed_flat = decompressed.to_field_elements();
    ASSERT_EQ(decompressed_flat.size(), original_flat.size());
    for (size_t i = 0; i < original_flat.size(); i++) {
        ASSERT_EQ(decompressed_flat[i], original_flat[i]) << "Mismatch at element " << i;
    }

    // Verify the decompressed proof
    EXPECT_TRUE(verify_chonk(decompressed, vk_and_hash));
}

/**
 * @brief Build a valid compressed proof, then corrupt a specific 32-byte element.
 */
static std::vector<uint8_t> compress_and_corrupt(const ChonkProof& proof, size_t element_idx, const uint256_t& value)
{
    auto compressed = ProofCompressor::compress_chonk_proof(proof);
    size_t byte_offset = element_idx * 32;
    EXPECT_LT(byte_offset + 32, compressed.size());
    // Overwrite the element with the given value (big-endian)
    std::vector<uint8_t> buf;
    write(buf, value);
    std::copy(buf.begin(), buf.end(), compressed.begin() + static_cast<ptrdiff_t>(byte_offset));
    return compressed;
}

// Rejects a BN scalar value >= Fr::modulus
TEST_F(ChonkTests, DecompressionRejectsNonCanonicalBN254Scalar)
{
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
    auto [proof, vk_and_hash] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);
    size_t mega_num_pub_inputs =
        proof.hiding_oink_proof.size() - ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;
    ASSERT_GT(mega_num_pub_inputs, 0); // Need at least one public input (BN254 scalar)

    // Element 0 is the first public input (a BN254 scalar). Set it to Fr::modulus (non-canonical).
    using Fr = curve::BN254::ScalarField;

    auto corrupted = compress_and_corrupt(proof, 0, Fr::modulus);
    EXPECT_THROW_OR_ABORT(ProofCompressor::decompress_chonk_proof(corrupted, mega_num_pub_inputs), "");
}

// Rejects a BN commitment x-coordinate >= Fq::modulus
TEST_F(ChonkTests, DecompressionRejectsNonCanonicalBN254CommitmentX)
{
    using Fq = curve::BN254::BaseField;

    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
    auto [proof, vk_and_hash] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);
    size_t mega_num_pub_inputs =
        proof.hiding_oink_proof.size() - ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;

    // First BN254 commitment is at element index mega_num_pub_inputs.
    // Set x-coordinate to Fq::modulus + 1 (non-canonical, with no sign bit).
    auto corrupted = compress_and_corrupt(proof, mega_num_pub_inputs, Fq::modulus + 1);
    EXPECT_THROW_OR_ABORT(ProofCompressor::decompress_chonk_proof(corrupted, mega_num_pub_inputs), "");
}

// Rejects a canonical x-coordinate that is not on the BN254 curve
TEST_F(ChonkTests, DecompressionRejectsInvalidBN254CurvePoint)
{
    using Fq = curve::BN254::BaseField;

    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
    auto [proof, vk_and_hash] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);
    size_t mega_num_pub_inputs =
        proof.hiding_oink_proof.size() - ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;

    // x=4 is not on BN254
    Fq x_not_on_curve(4);
    Fq rhs = x_not_on_curve * x_not_on_curve * x_not_on_curve + Fq(3);
    auto [is_sq, _] = rhs.sqrt();
    ASSERT_FALSE(is_sq);

    auto corrupted = compress_and_corrupt(proof, mega_num_pub_inputs, uint256_t(x_not_on_curve));
    EXPECT_THROW_OR_ABORT(ProofCompressor::decompress_chonk_proof(corrupted, mega_num_pub_inputs), "");
}

// Rejects a compressed proof that is too short (read_u256 bounds check)
TEST_F(ChonkTests, DecompressionRejectsTruncatedProof)
{
    TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
    auto [proof, vk_and_hash] = accumulate_and_prove_ivc(/*num_app_circuits=*/1, settings);
    size_t mega_num_pub_inputs =
        proof.hiding_oink_proof.size() - ProofLength::Oink<MegaZKFlavor>::LENGTH_WITHOUT_PUB_INPUTS;

    auto compressed = ProofCompressor::compress_chonk_proof(proof);
    // Truncate by removing the last 32-byte element
    compressed.resize(compressed.size() - 32);
    EXPECT_THROW_OR_ABORT(ProofCompressor::decompress_chonk_proof(compressed, mega_num_pub_inputs), "");
}
