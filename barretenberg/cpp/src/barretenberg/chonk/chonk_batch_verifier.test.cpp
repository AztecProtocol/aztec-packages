#ifndef __wasm__
#include "chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/test.hpp"

#include <atomic>
#include <condition_variable>
#include <mutex>

using namespace bb;

static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;

class ChonkBatchVerifierTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> generate_chonk_proof(
        size_t num_app_circuits = 1)
    {
        CircuitProducer circuit_producer(num_app_circuits);
        const size_t num_circuits = circuit_producer.total_num_circuits;
        Chonk ivc{ num_circuits };
        TestSettings settings{ .log2_num_gates = SMALL_LOG_2_NUM_GATES };
        for (size_t j = 0; j < num_circuits; ++j) {
            circuit_producer.construct_and_accumulate_next_circuit(ivc, settings);
        }
        return { ivc.prove(), ivc.get_hiding_kernel_vk_and_hash() };
    }

    /**
     * @brief Helper: collect results from the processor via callback.
     */
    struct ResultCollector {
        std::mutex mutex;
        std::condition_variable cv;
        std::vector<VerifyResult> results;
        size_t expected = 0;

        void on_result(VerifyResult r)
        {
            std::lock_guard lock(mutex);
            results.push_back(std::move(r));
            cv.notify_one();
        }

        void wait_for(size_t count, std::chrono::seconds timeout = std::chrono::seconds(120))
        {
            expected = count;
            std::unique_lock lock(mutex);
            ASSERT_TRUE(cv.wait_for(lock, timeout, [&] { return results.size() >= expected; }))
                << "Timed out waiting for " << expected << " results, got " << results.size();
        }
    };
};

TEST_F(ChonkBatchVerifierTests, BatchOfTwoValidProofs)
{
    auto [proof1, vk1] = generate_chonk_proof();
    auto [proof2, vk2] = generate_chonk_proof();

    ResultCollector collector;
    ChonkBatchVerifier verifier;

    // Both proofs use VK index 0 (same VK for simplicity)
    verifier.start(
        { vk1 }, /*num_cores=*/2, /*batch_size=*/2, [&](VerifyResult r) { collector.on_result(std::move(r)); });

    verifier.enqueue(VerifyRequest{ .request_id = 1, .vk_index = 0, .proof = std::move(proof1) });
    verifier.enqueue(VerifyRequest{ .request_id = 2, .vk_index = 0, .proof = std::move(proof2) });

    collector.wait_for(2);
    verifier.stop();

    ASSERT_EQ(collector.results.size(), 2);
    for (auto& r : collector.results) {
        EXPECT_TRUE(r.verified()) << "request_id=" << r.request_id << " error=" << r.error_message;
        EXPECT_GT(r.time_in_verify_ms, 0);
    }
}

TEST_F(ChonkBatchVerifierTests, FlushOnShutdown)
{
    // Enqueue 1 proof with batch_size=4, then stop. The proof should be flushed.
    auto [proof, vk] = generate_chonk_proof();

    ResultCollector collector;
    ChonkBatchVerifier verifier;

    verifier.start(
        { vk }, /*num_cores=*/1, /*batch_size=*/4, [&](VerifyResult r) { collector.on_result(std::move(r)); });
    verifier.enqueue(VerifyRequest{ .request_id = 42, .vk_index = 0, .proof = std::move(proof) });

    // Stop triggers flush of remaining items
    verifier.stop();

    ASSERT_EQ(collector.results.size(), 1);
    EXPECT_TRUE(collector.results[0].verified());
    EXPECT_EQ(collector.results[0].request_id, 42);
}

TEST_F(ChonkBatchVerifierTests, TamperedProofBisected)
{
    BB_DISABLE_ASSERTS();

    auto [good_proof, vk1] = generate_chonk_proof();
    auto [bad_proof, vk2] = generate_chonk_proof();

    // Corrupt the IPA proof portion
    ASSERT_FALSE(bad_proof.ipa_proof.empty());
    bad_proof.ipa_proof[0] = bad_proof.ipa_proof[0] + bb::fr(1);

    ResultCollector collector;
    ChonkBatchVerifier verifier;

    verifier.start(
        { vk1 }, /*num_cores=*/2, /*batch_size=*/2, [&](VerifyResult r) { collector.on_result(std::move(r)); });

    verifier.enqueue(VerifyRequest{ .request_id = 1, .vk_index = 0, .proof = std::move(good_proof) });
    verifier.enqueue(VerifyRequest{ .request_id = 2, .vk_index = 0, .proof = std::move(bad_proof) });

    collector.wait_for(2);
    verifier.stop();

    ASSERT_EQ(collector.results.size(), 2);

    // Find good and bad results by request_id
    const VerifyResult* good = nullptr;
    const VerifyResult* bad = nullptr;
    for (auto& r : collector.results) {
        if (r.request_id == 1) {
            good = &r;
        }
        if (r.request_id == 2) {
            bad = &r;
        }
    }

    ASSERT_NE(good, nullptr);
    ASSERT_NE(bad, nullptr);
    EXPECT_TRUE(good->verified()) << "good proof should verify, error=" << good->error_message;
    EXPECT_FALSE(bad->verified()) << "bad proof should fail";
    EXPECT_GT(bad->batch_failure_count, 0u) << "bisection should have occurred";
}

TEST_F(ChonkBatchVerifierTests, InvalidVkIndex)
{
    auto [proof, vk] = generate_chonk_proof();

    ResultCollector collector;
    ChonkBatchVerifier verifier;

    verifier.start(
        { vk }, /*num_cores=*/1, /*batch_size=*/1, [&](VerifyResult r) { collector.on_result(std::move(r)); });

    // vk_index=99 is out of range
    verifier.enqueue(VerifyRequest{ .request_id = 7, .vk_index = 99, .proof = std::move(proof) });

    collector.wait_for(1);
    verifier.stop();

    ASSERT_EQ(collector.results.size(), 1);
    EXPECT_FALSE(collector.results[0].verified());
    EXPECT_EQ(collector.results[0].request_id, 7);
    EXPECT_NE(collector.results[0].error_message.find("invalid vk_index"), std::string::npos);
}

#endif // __wasm__
