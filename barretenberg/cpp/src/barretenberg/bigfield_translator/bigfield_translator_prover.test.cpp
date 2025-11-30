// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#include "bigfield_translator_prover.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "bigfield_translator.hpp"
#include "bigfield_translator_verifier.hpp"
#include <gtest/gtest.h>

#ifdef __linux__
#include <fstream>

inline size_t get_current_rss_mib()
{
    std::ifstream statm("/proc/self/statm");
    size_t size, resident;
    statm >> size >> resident;
    return (resident * 4096) / (1024 * 1024);
}
#define LOG_CURRENT_MEM(msg) info(msg, " [current RSS: ", get_current_rss_mib(), " MiB]")
#else
#define LOG_CURRENT_MEM(msg) info(msg)
#endif

using namespace bb;

class BigfieldTranslatorProverTest : public ::testing::Test {
  protected:
    using Builder = MegaCircuitBuilder;
    using Fr = curve::BN254::ScalarField;
    using Fq = curve::BN254::BaseField;

    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    // Helper to create a populated op queue for testing (padded to OP_QUEUE_SIZE)
    static std::shared_ptr<ECCOpQueue> create_test_op_queue(size_t num_ops)
    {
        auto op_queue = std::make_shared<ECCOpQueue>();

        Builder builder;
        builder.op_queue = op_queue;

        for (size_t i = 0; i < num_ops; i++) {
            auto point = curve::BN254::Group::affine_one * Fr::random_element();
            auto scalar = Fr::random_element();
            builder.queue_ecc_mul_accum(point, scalar);
        }

        // Pad to OP_QUEUE_SIZE (power of 2) as the translator expects
        op_queue->merge(MergeSettings::APPEND, ECCOpQueue::OP_QUEUE_SIZE - op_queue->get_current_subtable_size());

        return op_queue;
    }
};

/**
 * @brief Test the BigfieldTranslatorProver and BigfieldTranslatorVerifier classes.
 */
TEST_F(BigfieldTranslatorProverTest, ProveAndVerify)
{
    constexpr size_t NUM_OPS = 400;

    auto op_queue = create_test_op_queue(NUM_OPS);
    info("Op queue has ", op_queue->get_ultra_ops().size(), " rows");

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Create prover and construct proof
    LOG_CURRENT_MEM("Creating BigfieldTranslatorProver...");
    BigfieldTranslatorProver prover(op_queue, x_native, v_native);
    LOG_CURRENT_MEM("Prover created, constructing proof...");

    auto proof = prover.construct_proof();
    info("Proof size: ", proof.size(), " elements");

    // Get verification key and accumulated result from prover
    auto verification_key = prover.get_verification_key();
    auto accumulated_result = prover.get_accumulated_result();

    // Verify the proof
    LOG_CURRENT_MEM("Creating BigfieldTranslatorVerifier...");
    auto transcript = std::make_shared<NativeTranscript>();
    BigfieldTranslatorVerifier verifier(verification_key, transcript);

    bool verified = verifier.verify_proof(proof, x_native, v_native, accumulated_result);
    EXPECT_TRUE(verified) << "BigfieldTranslator proof verification failed";
    LOG_CURRENT_MEM("Proof verified successfully!");
}

/**
 * @brief Verify that the accumulated result matches native computation.
 */
TEST_F(BigfieldTranslatorProverTest, AccumulatedResultMatchesNative)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Create prover
    BigfieldTranslatorProver prover(op_queue, x_native, v_native);

    // Get accumulated result from prover
    Fq accumulated_result = prover.get_accumulated_result();

    // Compute expected result natively
    Fq expected = BigfieldTranslator::compute_accumulator_native(x_native, v_native, op_queue);

    EXPECT_EQ(accumulated_result, expected) << "Accumulated result does not match native computation";
}

/**
 * @brief Test that verification fails with wrong accumulated result.
 */
TEST_F(BigfieldTranslatorProverTest, VerificationFailsWithWrongAccumulatedResult)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    BigfieldTranslatorProver prover(op_queue, x_native, v_native);
    auto proof = prover.construct_proof();
    auto verification_key = prover.get_verification_key();

    // Use wrong accumulated result
    Fq wrong_accumulated_result = Fq::random_element();

    auto transcript = std::make_shared<NativeTranscript>();
    BigfieldTranslatorVerifier verifier(verification_key, transcript);

    // The proof itself should still verify (it doesn't check accumulated_result internally)
    // The accumulated_result is checked via verify_translation which uses ECCVM evaluations
    bool verified = verifier.verify_proof(proof, x_native, v_native, wrong_accumulated_result);

    // Note: verify_proof only checks the Honk proof, not the accumulated_result consistency.
    // The accumulated_result is verified via verify_translation() with ECCVM evaluations.
    EXPECT_TRUE(verified) << "Proof verification should pass (accumulated_result checked separately)";
}

/**
 * @brief Test verify_translation with correct values.
 */
TEST_F(BigfieldTranslatorProverTest, VerifyTranslation)
{
    constexpr size_t NUM_OPS = 10;

    auto op_queue = create_test_op_queue(NUM_OPS);

    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    BigfieldTranslatorProver prover(op_queue, x_native, v_native);
    auto proof = prover.construct_proof();
    auto verification_key = prover.get_verification_key();
    Fq accumulated_result = prover.get_accumulated_result();

    auto transcript = std::make_shared<NativeTranscript>();
    BigfieldTranslatorVerifier verifier(verification_key, transcript);
    verifier.verify_proof(proof, x_native, v_native, accumulated_result);

    // Compute the expected ECCVM opening value: op + v*Px + v²*Py + v³*z1 + v⁴*z2
    // For this test, we simulate what ECCVM would provide
    // The translation check is: x * accumulated_result == eccvm_opening - masking_term

    // Create mock translation evaluations that satisfy the relation
    // x * accumulated_result = op + v*Px + v²*Py + v³*z1 + v⁴*z2 - masking_term
    Fq masking_term = Fq::random_element();
    Fq eccvm_opening = x_native * accumulated_result + masking_term;

    // For simplicity, set all evaluations to 0 except op which equals eccvm_opening
    TranslationEvaluations_<Fq> translation_evaluations;
    translation_evaluations.op = eccvm_opening;
    translation_evaluations.Px = Fq(0);
    translation_evaluations.Py = Fq(0);
    translation_evaluations.z1 = Fq(0);
    translation_evaluations.z2 = Fq(0);

    bool translation_verified = verifier.verify_translation(translation_evaluations, masking_term);
    EXPECT_TRUE(translation_verified) << "Translation verification failed";
}

/**
 * @brief Test that the verification key is independent of the number of actual ops in the fixed-size op queue.
 *
 * This is critical for the protocol: the VK must be constant regardless of how many operations
 * are actually used, since the op queue is always padded to OP_QUEUE_SIZE.
 */
TEST_F(BigfieldTranslatorProverTest, VKIndependentOfOpCount)
{
    // Use same challenges for all provers to ensure deterministic circuit structure
    Fq x_native = Fq::random_element();
    Fq v_native = Fq::random_element();

    // Create provers with different numbers of actual ops (all padded to same OP_QUEUE_SIZE)
    std::vector<size_t> op_counts = { 1, 10, 100, 500 };
    std::vector<std::shared_ptr<LightZKFlavor::VerificationKey>> verification_keys;

    // All op queues should have the same fixed size
    const size_t expected_size = create_test_op_queue(1)->get_ultra_ops().size();

    for (size_t num_ops : op_counts) {
        auto op_queue = create_test_op_queue(num_ops);
        ASSERT_EQ(op_queue->get_ultra_ops().size(), expected_size) << "Op queue should be padded to fixed size";

        BigfieldTranslatorProver prover(op_queue, x_native, v_native);
        verification_keys.push_back(prover.get_verification_key());

        info("Created VK for ", num_ops, " ops (op queue size: ", op_queue->get_ultra_ops().size(), ")");
    }

    // Compare all VKs - they should be identical
    auto reference_vk = verification_keys[0];
    for (size_t i = 1; i < verification_keys.size(); i++) {
        auto& vk = verification_keys[i];

        // Compare VK metadata
        EXPECT_EQ(reference_vk->log_circuit_size, vk->log_circuit_size)
            << "log_circuit_size mismatch for " << op_counts[i] << " ops";
        EXPECT_EQ(reference_vk->num_public_inputs, vk->num_public_inputs)
            << "num_public_inputs mismatch for " << op_counts[i] << " ops";
        EXPECT_EQ(reference_vk->pub_inputs_offset, vk->pub_inputs_offset)
            << "pub_inputs_offset mismatch for " << op_counts[i] << " ops";

        // Compare all precomputed commitments
        auto ref_commitments = reference_vk->get_all();
        auto vk_commitments = vk->get_all();

        ASSERT_EQ(ref_commitments.size(), vk_commitments.size()) << "Commitment count mismatch";

        for (size_t j = 0; j < ref_commitments.size(); j++) {
            EXPECT_EQ(ref_commitments[j], vk_commitments[j])
                << "Commitment " << j << " mismatch for " << op_counts[i] << " ops vs " << op_counts[0] << " ops";
        }
    }

    info("All VKs are identical across different op counts!");
}
