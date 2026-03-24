#ifndef __wasm__
#include "chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/test.hpp"

#include <algorithm>
#include <atomic>
#include <condition_variable>
#include <mutex>
#include <numeric>
#include <random>
#include <set>

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

/**
 * @brief Parameterized mixed good/bad batch test.
 *
 * The seed drives everything: total proof count, how many are bad, batch size,
 * and which indices are corrupted. Each seed produces a deterministic scenario.
 */
TEST_F(ChonkBatchVerifierTests, RandomMixedBatches)
{
    BB_DISABLE_ASSERTS();
    auto [good_proof_template, vk] = generate_chonk_proof();

    // { seed, total, num_bad, batch_size, num_cores }
    struct TestCase {
        uint32_t seed;
        size_t total;
        size_t num_bad;
        uint32_t batch_size;
        uint32_t num_cores;
    };
    const std::vector<TestCase> cases = {
        { 42, 16, 0, 16, 4 },    // all valid
        { 100, 8, 8, 8, 4 },     // all invalid
        { 8080, 30, 1, 30, 4 },  // needle in haystack
        { 2025, 30, 10, 30, 4 }, // ~1/3 bad
        { 6174, 30, 15, 30, 4 }, // half bad
        { 9999, 30, 29, 30, 4 }, // inverted needle
        { 1337, 30, 7, 8, 4 },   // failures across multiple batches
        { 314, 12, 3, 12, 1 },   // single core
        { 555, 8, 3, 1, 4 },     // degenerate batch_size=1
    };

    for (const auto& [seed, total, num_bad, batch_size, num_cores] : cases) {
        SCOPED_TRACE("seed=" + std::to_string(seed) + " total=" + std::to_string(total) +
                     " num_bad=" + std::to_string(num_bad) + " batch_size=" + std::to_string(batch_size));

        // Pick bad indices via seeded Fisher-Yates shuffle
        std::vector<size_t> indices(total);
        std::iota(indices.begin(), indices.end(), 0);
        std::mt19937 rng(seed);
        for (size_t i = total - 1; i > 0; --i) {
            std::uniform_int_distribution<size_t> dist(0, i);
            std::swap(indices[i], indices[dist(rng)]);
        }
        std::set<size_t> bad_indices(indices.begin(), indices.begin() + static_cast<ptrdiff_t>(num_bad));

        // Build proofs, corrupting IPA for bad ones
        std::vector<ChonkProof> proofs;
        proofs.reserve(total);
        for (size_t i = 0; i < total; ++i) {
            proofs.push_back(good_proof_template);
            if (bad_indices.count(i)) {
                proofs.back().ipa_proof[0] = proofs.back().ipa_proof[0] + bb::fr(1);
            }
        }

        ResultCollector collector;
        ChonkBatchVerifier verifier;
        verifier.start({ vk }, num_cores, batch_size, [&](VerifyResult r) { collector.on_result(std::move(r)); });

        for (size_t i = 0; i < total; ++i) {
            verifier.enqueue(
                VerifyRequest{ .request_id = static_cast<uint64_t>(i), .vk_index = 0, .proof = std::move(proofs[i]) });
        }

        collector.wait_for(total, std::chrono::seconds(300));
        verifier.stop();

        ASSERT_EQ(collector.results.size(), total);
        std::sort(collector.results.begin(), collector.results.end(), [](auto& a, auto& b) {
            return a.request_id < b.request_id;
        });
        for (size_t i = 0; i < total; ++i) {
            EXPECT_EQ(collector.results[i].request_id, i);
            if (bad_indices.count(i)) {
                EXPECT_FALSE(collector.results[i].verified()) << "proof " << i << " should fail";
            } else {
                EXPECT_TRUE(collector.results[i].verified()) << "proof " << i << " should pass";
            }
        }
    }
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
