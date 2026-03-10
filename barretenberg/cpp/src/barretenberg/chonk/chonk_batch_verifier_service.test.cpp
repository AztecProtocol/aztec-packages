#ifndef __wasm__
/**
 * @file chonk_batch_verifier_service.test.cpp
 * @brief Tests for the 3-class batch verification architecture with real Chonk proofs.
 *
 * Tests cover:
 * - IPABatchProcessor: 3-phase pipeline (parallel reduce → batch IPA → emit/bisect)
 * - UntrustedVerifierPool: individual proof verification on dedicated threads
 * - ChonkBatchVerifierService: full service with FIFO streaming
 * - Corruption scenarios: IPA-corrupted and sumcheck-corrupted proofs
 */

#include "chonk_batch_verifier_service.hpp"
#include "batch_verifier_types.hpp"
#include "ipa_batch_processor.hpp"
#include "untrusted_verifier_pool.hpp"

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

#include <fcntl.h>
#include <filesystem>
#include <future>
#include <sys/stat.h>
#include <unistd.h>

using namespace bb;

static constexpr size_t SMALL_LOG_2_NUM_GATES = 5;

class ChonkBatchVerifierServiceTests : public ::testing::Test {
  protected:
    static void SetUpTestSuite() { bb::srs::init_file_crs_factory(bb::srs::bb_crs_path()); }

    using CircuitProducer = PrivateFunctionExecutionMockCircuitProducer;

    // Generate a valid Chonk proof with its VK
    static std::pair<ChonkProof, std::shared_ptr<MegaZKFlavor::VKAndHash>> generate_proof(size_t num_app_circuits = 1)
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

    // Create a copy of a proof with corrupted IPA data (targets Phase 2: batch IPA verification)
    static ChonkProof corrupt_ipa(const ChonkProof& proof)
    {
        ChonkProof corrupted = proof;
        EXPECT_FALSE(corrupted.goblin_proof.ipa_proof.empty());
        corrupted.goblin_proof.ipa_proof[0] = corrupted.goblin_proof.ipa_proof[0] + bb::fr(1);
        return corrupted;
    }

    // Create a copy of a proof with corrupted non-IPA data (targets Phase 1: sumcheck/goblin verification)
    static ChonkProof corrupt_sumcheck(const ChonkProof& proof)
    {
        ChonkProof corrupted = proof;
        // Corrupt the mega proof (affects sumcheck/honk verification, not IPA)
        EXPECT_FALSE(corrupted.mega_proof.empty());
        corrupted.mega_proof[0] = corrupted.mega_proof[0] + bb::fr(1);
        return corrupted;
    }

    // Collect results from a callback into a vector
    struct ResultCollector {
        std::mutex mutex;
        std::vector<VerifyResult> results;

        std::function<void(VerifyResult)> callback()
        {
            return [this](VerifyResult result) {
                std::lock_guard lock(mutex);
                results.push_back(std::move(result));
            };
        }

        void wait_for(size_t count, std::chrono::seconds timeout = std::chrono::seconds(120))
        {
            auto deadline = std::chrono::steady_clock::now() + timeout;
            while (true) {
                {
                    std::lock_guard lock(mutex);
                    if (results.size() >= count) {
                        return;
                    }
                }
                ASSERT_LT(std::chrono::steady_clock::now(), deadline)
                    << "Timed out waiting for " << count << " results, got " << results.size();
                std::this_thread::sleep_for(std::chrono::milliseconds(50));
            }
        }

        VerifyResult find(uint64_t request_id)
        {
            std::lock_guard lock(mutex);
            for (const auto& r : results) {
                if (r.request_id == request_id) {
                    return r;
                }
            }
            EXPECT_TRUE(false) << "Result not found for request_id " << request_id;
            return {};
        }
    };
};

// --- IPABatchProcessor Tests ---

TEST_F(ChonkBatchVerifierServiceTests, TrustedBatchAllValid)
{
    auto [proof, vk] = generate_proof();
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    ResultCollector collector;
    IPABatchProcessor processor;
    processor.start(vks, /*num_ipa_cores=*/2, /*num_sumcheck_cores=*/2, /*batch_size=*/2, collector.callback());

    // Queue 2 copies of the valid proof
    processor.enqueue(VerifyRequest{ .request_id = 1, .proof = proof, .vk_index = 0 });
    processor.enqueue(VerifyRequest{ .request_id = 2, .proof = proof, .vk_index = 0 });

    processor.stop();

    ASSERT_EQ(collector.results.size(), 2u);
    for (const auto& r : collector.results) {
        EXPECT_TRUE(r.verified);
        EXPECT_EQ(r.status, static_cast<uint8_t>(VerifyStatus::OK));
        EXPECT_EQ(r.batch_failure_count, 0u);
    }
}

TEST_F(ChonkBatchVerifierServiceTests, TrustedBatchWithIPACorruption)
{
    BB_DISABLE_ASSERTS();

    auto [proof, vk] = generate_proof();
    auto bad_proof = corrupt_ipa(proof);
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    ResultCollector collector;
    IPABatchProcessor processor;
    // batch_size=2 so both go in same batch, then bisection identifies the bad one
    processor.start(vks, /*num_ipa_cores=*/2, /*num_sumcheck_cores=*/2, /*batch_size=*/2, collector.callback());

    processor.enqueue(VerifyRequest{ .request_id = 1, .proof = proof, .vk_index = 0 });
    processor.enqueue(VerifyRequest{ .request_id = 2, .proof = bad_proof, .vk_index = 0 });

    processor.stop();

    ASSERT_EQ(collector.results.size(), 2u);
    auto good = collector.find(1);
    auto bad = collector.find(2);

    EXPECT_TRUE(good.verified);
    EXPECT_EQ(good.status, static_cast<uint8_t>(VerifyStatus::OK));
    EXPECT_GT(good.batch_failure_count, 0u); // Was part of a failed batch that got bisected

    EXPECT_FALSE(bad.verified);
    EXPECT_EQ(bad.status, static_cast<uint8_t>(VerifyStatus::FAILED));
    EXPECT_GT(bad.batch_failure_count, 0u);
}

TEST_F(ChonkBatchVerifierServiceTests, TrustedBatchWithSumcheckCorruption)
{
    BB_DISABLE_ASSERTS();

    auto [proof, vk] = generate_proof();
    auto bad_proof = corrupt_sumcheck(proof);
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    ResultCollector collector;
    IPABatchProcessor processor;
    processor.start(vks, /*num_ipa_cores=*/2, /*num_sumcheck_cores=*/2, /*batch_size=*/2, collector.callback());

    processor.enqueue(VerifyRequest{ .request_id = 1, .proof = proof, .vk_index = 0 });
    processor.enqueue(VerifyRequest{ .request_id = 2, .proof = bad_proof, .vk_index = 0 });

    processor.stop();

    ASSERT_EQ(collector.results.size(), 2u);
    auto good = collector.find(1);
    auto bad = collector.find(2);

    EXPECT_TRUE(good.verified);
    EXPECT_FALSE(bad.verified);
    EXPECT_EQ(bad.status, static_cast<uint8_t>(VerifyStatus::FAILED));
}

TEST_F(ChonkBatchVerifierServiceTests, TrustedBatchCancelBySource)
{
    auto [proof, vk] = generate_proof();
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    ResultCollector collector;
    IPABatchProcessor processor;
    // Large batch size so proofs stay queued
    processor.start(vks, /*num_ipa_cores=*/2, /*num_sumcheck_cores=*/2, /*batch_size=*/100, collector.callback());

    processor.enqueue(VerifyRequest{ .request_id = 1, .proof = proof, .vk_index = 0, .source = "peer-A" });
    processor.enqueue(VerifyRequest{ .request_id = 2, .proof = proof, .vk_index = 0, .source = "peer-B" });
    processor.enqueue(VerifyRequest{ .request_id = 3, .proof = proof, .vk_index = 0, .source = "peer-A" });

    // Cancel all from peer-A
    uint32_t cancelled = processor.cancel_by_source("peer-A");
    EXPECT_EQ(cancelled, 2u);

    processor.stop();

    // Should have 3 results: 2 cancelled (peer-A) + 1 verified (peer-B)
    ASSERT_EQ(collector.results.size(), 3u);

    auto r1 = collector.find(1);
    auto r2 = collector.find(2);
    auto r3 = collector.find(3);

    EXPECT_EQ(r1.status, static_cast<uint8_t>(VerifyStatus::CANCELLED));
    EXPECT_TRUE(r2.verified);
    EXPECT_EQ(r3.status, static_cast<uint8_t>(VerifyStatus::CANCELLED));
}

// --- UntrustedVerifierPool Tests ---

TEST_F(ChonkBatchVerifierServiceTests, UntrustedSingleValid)
{
    auto [proof, vk] = generate_proof();
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    ResultCollector collector;
    UntrustedVerifierPool pool;
    pool.start(vks, /*num_threads=*/2, collector.callback());

    pool.enqueue(VerifyRequest{ .request_id = 1, .proof = proof, .vk_index = 0 });
    collector.wait_for(1);

    pool.stop();

    ASSERT_EQ(collector.results.size(), 1u);
    EXPECT_TRUE(collector.results[0].verified);
    EXPECT_EQ(collector.results[0].status, static_cast<uint8_t>(VerifyStatus::OK));
    EXPECT_GT(collector.results[0].time_in_verify_ms, 0.0);
}

TEST_F(ChonkBatchVerifierServiceTests, UntrustedIPACorruption)
{
    BB_DISABLE_ASSERTS();

    auto [proof, vk] = generate_proof();
    auto bad_proof = corrupt_ipa(proof);
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    ResultCollector collector;
    UntrustedVerifierPool pool;
    pool.start(vks, /*num_threads=*/2, collector.callback());

    pool.enqueue(VerifyRequest{ .request_id = 1, .proof = bad_proof, .vk_index = 0 });
    collector.wait_for(1);

    pool.stop();

    ASSERT_EQ(collector.results.size(), 1u);
    EXPECT_FALSE(collector.results[0].verified);
    EXPECT_EQ(collector.results[0].status, static_cast<uint8_t>(VerifyStatus::FAILED));
}

// --- Full Service Test ---

TEST_F(ChonkBatchVerifierServiceTests, FullServiceMixedTrustedUntrusted)
{
    auto [proof, vk] = generate_proof();
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    // Create a temporary FIFO
    std::string fifo_path = "/tmp/chonk_batch_test_" + std::to_string(getpid()) + ".fifo";

    // Open FIFO reader in background thread that parses size-delimited msgpack messages
    std::mutex fifo_mutex;
    std::vector<VerifyResult> fifo_results;
    std::atomic<size_t> fifo_result_count{ 0 };

    // Create FIFO first
    mkfifo(fifo_path.c_str(), 0600);

    std::thread reader_thread([&]() {
        int fd = open(fifo_path.c_str(), O_RDONLY);
        if (fd < 0) {
            return;
        }

        // Read size-delimited msgpack messages: [4-byte BE length][payload]
        while (true) {
            uint8_t size_buf[4];
            ssize_t n = read(fd, size_buf, 4);
            if (n <= 0) {
                break;
            }
            if (n != 4) {
                continue;
            }

            uint32_t size = (static_cast<uint32_t>(size_buf[0]) << 24) | (static_cast<uint32_t>(size_buf[1]) << 16) |
                            (static_cast<uint32_t>(size_buf[2]) << 8) | static_cast<uint32_t>(size_buf[3]);

            std::vector<uint8_t> payload(size);
            size_t read_so_far = 0;
            while (read_so_far < size) {
                n = read(fd, payload.data() + read_so_far, size - read_so_far);
                if (n <= 0) {
                    break;
                }
                read_so_far += static_cast<size_t>(n);
            }

            if (read_so_far == size) {
                VerifyResult result;
                msgpack::unpack(reinterpret_cast<const char*>(payload.data()), payload.size()).get().convert(result);
                {
                    std::lock_guard lock(fifo_mutex);
                    fifo_results.push_back(std::move(result));
                }
                fifo_result_count.fetch_add(1);
            }
        }
        close(fd);
    });

    ChonkBatchVerifierService service;
    BatchVerifierConfig config{
        .num_ipa_cores = 2,
        .num_sumcheck_cores = 2,
        .num_untrusted_cores = 1,
        .trusted_batch_size = 2,
    };
    service.start(vks, fifo_path, config);

    // Queue trusted proofs (will batch together)
    service.queue(VerifyRequest{ .request_id = 1, .proof = proof, .vk_index = 0, .trusted = true });
    service.queue(VerifyRequest{ .request_id = 2, .proof = proof, .vk_index = 0, .trusted = true });

    // Queue untrusted proof
    service.queue(VerifyRequest{ .request_id = 3, .proof = proof, .vk_index = 0, .trusted = false });

    // Stop blocks until all work is drained and FIFO is closed
    service.stop();

    // Wait for reader to finish (FIFO EOF after service closes fd)
    if (reader_thread.joinable()) {
        reader_thread.join();
    }

    // Verify we got exactly 3 results on the FIFO
    {
        std::lock_guard lock(fifo_mutex);
        ASSERT_EQ(fifo_results.size(), 3u) << "Expected 3 results on FIFO";

        // All should be verified OK
        for (const auto& r : fifo_results) {
            EXPECT_TRUE(r.verified) << "Request " << r.request_id << " should have verified";
            EXPECT_EQ(r.status, static_cast<uint8_t>(VerifyStatus::OK));
        }
    }

    // Clean up
    std::filesystem::remove(fifo_path);
}

#endif // __wasm__
