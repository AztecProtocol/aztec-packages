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
#include "batch_verifier_test_utils.hpp"
#include "ipa_batch_processor.hpp"
#include "untrusted_verifier_pool.hpp"

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/chonk/mock_circuit_producer.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/goblin/goblin_verifier.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include "barretenberg/ultra_honk/ultra_verifier.hpp"

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
    using ResultCollector = test_utils::ResultCollector;

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

    static ChonkProof corrupt_ipa(const ChonkProof& proof) { return test_utils::corrupt_ipa(proof); }
    static ChonkProof corrupt_sumcheck(const ChonkProof& proof) { return test_utils::corrupt_sumcheck(proof); }
};

// --- IPABatchProcessor Tests ---

TEST_F(ChonkBatchVerifierServiceTests, TrustedBatchAllValid)
{
    auto [proof, vk] = generate_proof();
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    ResultCollector collector;
    IPABatchProcessor processor;
    processor.start(vks, /*num_cores=*/2, /*batch_size=*/2, collector.callback());

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
    processor.start(vks, /*num_cores=*/2, /*batch_size=*/2, collector.callback());

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
    processor.start(vks, /*num_cores=*/2, /*batch_size=*/2, collector.callback());

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
    processor.start(vks, /*num_cores=*/2, /*batch_size=*/100, collector.callback());

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
        .num_trusted_cores = 2,
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

// --- Piece-by-piece verification timing ---

/**
 * @brief Time each sub-step of Chonk verification to identify what can be skipped for fast IPA claim extraction.
 *
 * Breaks reduce_to_ipa_claim into its constituent steps:
 * 1. MegaZK verify_proof (hiding kernel honk verification + pairing check)
 * 2. Databus consistency check
 * 3. Goblin sub-steps:
 *    a. Merge reduce_to_pairing_check
 *    b. ECCVM reduce_to_ipa_opening  ← this produces the IPA claim
 *    c. Translator reduce_to_pairing_check
 * 4. Single IPA verify
 * 5. Batch IPA verify at various N
 */
TEST_F(ChonkBatchVerifierServiceTests, PiecewiseVerificationTiming)
{
    auto [proof, vk] = generate_proof();

    constexpr int ITERS = 5;
    constexpr uint32_t NUM_CORES = 1;
    set_parallel_for_concurrency(NUM_CORES);
    info("=== Piecewise Verification Timing (", NUM_CORES, " cores) ===");

    // Warmup
    {
        ChonkNativeVerifier v(vk);
        v.reduce_to_ipa_claim(proof);
    }

    // --- Sub-step timing of reduce_to_ipa_claim ---
    // Replicate the steps from chonk_verifier.cpp with timers around each
    using Transcript = NativeTranscript;
    using HidingKernelVerifier = bb::MegaZKVerifier;
    using NativeGoblinVerifier = bb::GoblinVerifier;
    using MergeCommitments = typename NativeGoblinVerifier::MergeCommitments;

    double mega_total = 0, databus_total = 0, merge_total = 0, eccvm_total = 0, translator_total = 0;
    OpeningClaim<curve::Grumpkin> last_ipa_claim;
    HonkProof last_ipa_proof;

    for (int i = 0; i < ITERS; i++) {
        auto transcript = std::make_shared<Transcript>();

        // Step 1: MegaZK verify_proof
        auto t0 = std::chrono::steady_clock::now();
        HidingKernelVerifier mega_verifier{ vk, transcript };
        auto mega_output = mega_verifier.verify_proof(proof.mega_proof);
        auto t1 = std::chrono::steady_clock::now();
        double mega_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
        mega_total += mega_ms;
        ASSERT_TRUE(mega_output.result);

        // Step 2: Databus consistency
        auto t2 = std::chrono::steady_clock::now();
        HidingKernelIO kernel_io;
        kernel_io.reconstruct_from_public(mega_verifier.get_public_inputs());
        auto calldata = mega_verifier.get_calldata_commitment();
        bool databus_ok = (calldata == kernel_io.kernel_return_data);
        auto t3 = std::chrono::steady_clock::now();
        double databus_ms = std::chrono::duration<double, std::milli>(t3 - t2).count();
        databus_total += databus_ms;
        ASSERT_TRUE(databus_ok);

        // Step 3a: Merge
        MergeCommitments merge_commits{ .t_commitments = mega_verifier.get_ecc_op_wires(),
                                        .T_prev_commitments = kernel_io.ecc_op_tables };
        auto t4 = std::chrono::steady_clock::now();
        MergeVerifier_<curve::BN254> merge_verifier{ MergeSettings::APPEND, transcript };
        auto merge_result = merge_verifier.reduce_to_pairing_check(proof.goblin_proof.merge_proof, merge_commits);
        auto t5 = std::chrono::steady_clock::now();
        double merge_ms = std::chrono::duration<double, std::milli>(t5 - t4).count();
        merge_total += merge_ms;

        // Step 3b: ECCVM
        auto t6 = std::chrono::steady_clock::now();
        ECCVMVerifier_<ECCVMFlavor> eccvm_verifier{ transcript, proof.goblin_proof.eccvm_proof };
        auto eccvm_result = eccvm_verifier.reduce_to_ipa_opening();
        auto t7 = std::chrono::steady_clock::now();
        double eccvm_ms = std::chrono::duration<double, std::milli>(t7 - t6).count();
        eccvm_total += eccvm_ms;

        // Step 3c: Translator
        auto translator_input = eccvm_verifier.get_translator_input_data();
        auto t8 = std::chrono::steady_clock::now();
        TranslatorVerifier_<TranslatorFlavor> translator_verifier{ transcript,
                                                                   proof.goblin_proof.translator_proof,
                                                                   translator_input.evaluation_challenge_x,
                                                                   translator_input.batching_challenge_v,
                                                                   translator_input.accumulated_result,
                                                                   merge_result.merged_commitments };
        [[maybe_unused]] auto translator_result = translator_verifier.reduce_to_pairing_check();
        auto t9 = std::chrono::steady_clock::now();
        double translator_ms = std::chrono::duration<double, std::milli>(t9 - t8).count();
        translator_total += translator_ms;

        last_ipa_claim = std::move(eccvm_result.ipa_claim);
        last_ipa_proof = proof.goblin_proof.ipa_proof;

        info("  [",
             i,
             "] mega=",
             mega_ms,
             " databus=",
             databus_ms,
             " merge=",
             merge_ms,
             " eccvm=",
             eccvm_ms,
             " translator=",
             translator_ms,
             " total=",
             mega_ms + databus_ms + merge_ms + eccvm_ms + translator_ms,
             " ms");
    }

    info("  --- Averages over ", ITERS, " iterations ---");
    info("  MegaZK verify:    ", mega_total / ITERS, " ms");
    info("  Databus check:    ", databus_total / ITERS, " ms");
    info("  Merge verify:     ", merge_total / ITERS, " ms");
    info("  ECCVM reduce:     ", eccvm_total / ITERS, " ms  ← produces IPA claim");
    info("  Translator verify:", translator_total / ITERS, " ms");
    double reduce_avg = (mega_total + databus_total + merge_total + eccvm_total + translator_total) / ITERS;
    info("  Total reduce:     ", reduce_avg, " ms");

    // --- IPA timing ---
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };

    double ipa_single_total = 0;
    for (int i = 0; i < ITERS; i++) {
        auto t = std::make_shared<NativeTranscript>(last_ipa_proof);
        auto t0 = std::chrono::steady_clock::now();
        bool ok = IPA<curve::Grumpkin>::reduce_verify(ipa_vk, last_ipa_claim, t);
        auto t1 = std::chrono::steady_clock::now();
        double ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
        ipa_single_total += ms;
        EXPECT_TRUE(ok);
    }
    info("  IPA single verify:", ipa_single_total / ITERS, " ms");

    // --- Batch IPA timing ---
    constexpr size_t MAX_BATCH = 16;
    std::vector<OpeningClaim<curve::Grumpkin>> claims;
    std::vector<HonkProof> ipa_proofs;
    for (size_t i = 0; i < MAX_BATCH; i++) {
        ChonkNativeVerifier verifier(vk);
        auto result = verifier.reduce_to_ipa_claim(proof);
        ASSERT_TRUE(result.all_checks_passed);
        claims.push_back(std::move(result.ipa_claim));
        ipa_proofs.push_back(std::move(result.ipa_proof));
    }

    for (size_t batch_size : { size_t(1), size_t(2), size_t(4), size_t(8), size_t(16) }) {
        double batch_total_ms = 0;
        for (int iter = 0; iter < ITERS; iter++) {
            std::vector<OpeningClaim<curve::Grumpkin>> batch_claims(
                claims.begin(), claims.begin() + static_cast<ptrdiff_t>(batch_size));
            std::vector<std::shared_ptr<NativeTranscript>> batch_transcripts;
            batch_transcripts.reserve(batch_size);
            for (size_t i = 0; i < batch_size; i++) {
                batch_transcripts.push_back(std::make_shared<NativeTranscript>(ipa_proofs[i]));
            }

            auto t0 = std::chrono::steady_clock::now();
            bool ok = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, batch_claims, batch_transcripts);
            auto t1 = std::chrono::steady_clock::now();
            batch_total_ms += std::chrono::duration<double, std::milli>(t1 - t0).count();
            EXPECT_TRUE(ok);
        }
        info("  batch IPA N=", batch_size, " avg: ", batch_total_ms / ITERS, " ms");
    }

    info("=== End Piecewise Timing ===");
}

/**
 * @brief Scale benchmark: batch pipeline vs naive work-stealing at 4 cores, 120 proofs.
 *
 * Compares:
 * A) Batch pipeline: work-stealing reduce → batch pairing → batch IPA
 * B) Naive work-stealing: 4 threads each doing full individual verify (reduce + individual IPA)
 */
TEST_F(ChonkBatchVerifierServiceTests, DISABLED_ScaleBenchmark)
{
    BB_DISABLE_ASSERTS();
    auto [proof, vk] = generate_proof();
    auto bad_ipa_proof = corrupt_ipa(proof);
    auto bad_sumcheck_proof = corrupt_sumcheck(proof);
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks = { vk };

    constexpr uint32_t NUM_CORES = 4;
    constexpr size_t NUM_PROOFS = 120;

    struct Scenario {
        std::string name;
        size_t num_bad_ipa;
        size_t num_bad_sumcheck;
    };

    std::vector<Scenario> scenarios = {
        { "all valid", 0, 0 },
        { "1 bad IPA", 1, 0 },
        { "5 bad sumcheck", 0, 5 },
        { "mixed (2 bad IPA + 5 bad sumcheck)", 2, 5 },
    };

    info("=== Scale Benchmark: 120 proofs, 4 cores ===");

    // ─── A) Batch pipeline ───
    info("--- A) Batch Pipeline ---");
    for (const auto& scenario : scenarios) {
        ResultCollector collector;
        IPABatchProcessor processor;
        processor.start(vks,
                        /*num_cores=*/NUM_CORES,
                        /*batch_size=*/NUM_PROOFS,
                        collector.callback());

        auto t0 = std::chrono::steady_clock::now();

        uint64_t req_id = 1;
        size_t num_valid = NUM_PROOFS - scenario.num_bad_ipa - scenario.num_bad_sumcheck;
        for (size_t i = 0; i < num_valid; i++) {
            processor.enqueue(VerifyRequest{ .request_id = req_id++, .proof = proof, .vk_index = 0 });
        }
        for (size_t i = 0; i < scenario.num_bad_ipa; i++) {
            processor.enqueue(VerifyRequest{ .request_id = req_id++, .proof = bad_ipa_proof, .vk_index = 0 });
        }
        for (size_t i = 0; i < scenario.num_bad_sumcheck; i++) {
            processor.enqueue(VerifyRequest{ .request_id = req_id++, .proof = bad_sumcheck_proof, .vk_index = 0 });
        }

        processor.stop();

        auto t1 = std::chrono::steady_clock::now();
        double total_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();

        size_t ok_count = 0;
        for (const auto& r : collector.results) {
            if (r.verified) {
                ok_count++;
            }
        }
        EXPECT_EQ(collector.results.size(), NUM_PROOFS);

        info("  ",
             scenario.name,
             ": total=",
             total_ms,
             "ms, per_proof=",
             total_ms / NUM_PROOFS,
             "ms (ok=",
             ok_count,
             " fail=",
             NUM_PROOFS - ok_count,
             ")");
    }

    // ─── B) Naive work-stealing: N threads each doing full individual verify ───
    info("--- B) Naive Work-Stealing (individual verify) ---");
    {
        // All valid scenario
        auto ipa_vk = std::make_shared<VerifierCommitmentKey<curve::Grumpkin>>(ECCVMFlavor::ECCVM_FIXED_SIZE);
        std::atomic<size_t> work_index{ 0 };
        std::atomic<size_t> pass_count{ 0 };

        auto t0 = std::chrono::steady_clock::now();

        std::vector<std::thread> workers;
        for (uint32_t w = 0; w < NUM_CORES; w++) {
            workers.emplace_back([&]() {
                set_parallel_for_concurrency(1);
                while (true) {
                    size_t idx = work_index.fetch_add(1, std::memory_order_relaxed);
                    if (idx >= NUM_PROOFS) {
                        break;
                    }
                    ChonkNativeVerifier verifier(vk);
                    auto result = verifier.reduce_to_ipa_claim(proof);
                    if (result.all_checks_passed) {
                        auto transcript = std::make_shared<NativeTranscript>(result.ipa_proof);
                        bool ok = IPA<curve::Grumpkin>::reduce_verify(*ipa_vk, result.ipa_claim, transcript);
                        if (ok) {
                            pass_count.fetch_add(1, std::memory_order_relaxed);
                        }
                    }
                }
            });
        }
        for (auto& t : workers) {
            t.join();
        }

        auto t1 = std::chrono::steady_clock::now();
        double total_ms = std::chrono::duration<double, std::milli>(t1 - t0).count();
        EXPECT_EQ(pass_count.load(), NUM_PROOFS);
        info("  all valid: total=",
             total_ms,
             "ms, per_proof=",
             total_ms / NUM_PROOFS,
             "ms (ok=",
             pass_count.load(),
             ")");
    }

    info("=== End Scale Benchmark ===");
}

#endif // __wasm__
