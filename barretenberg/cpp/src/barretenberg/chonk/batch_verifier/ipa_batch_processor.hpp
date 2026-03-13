#ifndef __wasm__
#pragma once
/**
 * @file ipa_batch_processor.hpp
 * @brief 4-phase trusted batch proof verification: parallel reduce → batch pairing → batch IPA → emit results.
 *
 * Pipeline for trusted proofs:
 * 1. **Parallel reduce**: Run reduce_to_batch_ipa_claim for each proof on sumcheck worker threads.
 *    Each proof produces an IPA claim, pairing points (3 sets), + all_checks_passed flag.
 *    Proofs that fail non-IPA/non-pairing checks are emitted as FAILED immediately.
 *
 * 2. **Batch pairing check**: Aggregate all N proofs' pairing points (MegaZK PCS, Merge,
 *    Translator — 3 sets per proof) with random challenges into ONE pairing check.
 *
 * 3. **Batch IPA verify**: Claims from passed proofs are batch-verified via a single
 *    IPA::batch_reduce_verify call (single large SRS MSM). Uses dedicated IPA cores
 *    via set_parallel_for_concurrency.
 *
 * 4. **Emit results / bisect**: If IPA passes, emit OK for all. If IPA fails,
 *    bisect using cached claims (no re-reduction needed) to find bad proofs.
 *
 * Bad proof handling:
 * - Phase 1 failures (sumcheck/Goblin errors): caught during reduce, emitted as FAILED immediately.
 *   Cost: only reduce time for that proof. No impact on batch throughput.
 * - Phase 2 failures (invalid IPA): triggers bisection of the batch using cached claims.
 *   Cost: O(log N) additional IPA verifications. Expensive but requires adversarial construction.
 *   The networking layer penalizes peers that trigger repeated bisections out-of-band.
 *
 * Threading: sumcheck workers and IPA cores are dedicated allocations.
 * Sumcheck workers run reduce_to_ipa_claim in parallel (each with set_parallel_for_concurrency(1)).
 * IPA batch uses all IPA cores via parallel_for for the MSM.
 * These can overlap across batches: while batch N's IPA runs, batch N+1's sumcheck can proceed.
 */

#include "barretenberg/chonk/chonk_verifier.hpp"
#include "batch_verifier_types.hpp"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <set>
#include <thread>
#include <vector>

namespace bb {

class IPABatchProcessor {
  public:
    using ResultCallback = std::function<void(VerifyResult)>;

    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               uint32_t num_ipa_cores,
               uint32_t num_sumcheck_cores,
               uint32_t batch_size,
               ResultCallback on_result);

    void enqueue(VerifyRequest request);
    bool cancel(uint64_t request_id);
    uint32_t cancel_by_source(const std::string& source);

    /** Flush accumulator, process remaining work, join all threads. */
    void stop();
    ~IPABatchProcessor();

  private:
    using DeferredIPAClaim = ChonkNativeVerifier::DeferredIPAClaim;

    using NativePairingPoints = bb::PairingPoints<curve::BN254>;

    /**
     * @brief Result of reduce_to_batch_ipa_claim for a single proof.
     * Contains a DeferredIPAClaim (ECCVM Shplonk MSM not yet computed) and
     * deferred pairing points (3 sets: MegaZK PCS, Merge, Translator).
     * Cached so that bisection can reuse claims without re-running reduction.
     */
    struct ReduceResult {
        uint64_t request_id = 0;
        std::string source;
        DeferredIPAClaim deferred_ipa_claim; // Deferred ECCVM Shplonk MSM + evaluation
        HonkProof ipa_proof;
        // Deferred pairing points from this proof
        NativePairingPoints mega_pcs_pairing_points;
        NativePairingPoints merge_pairing_points;
        NativePairingPoints translator_pairing_points;
        bool all_checks_passed = false;
        std::string error_message;
        std::chrono::steady_clock::time_point enqueue_time;
        double reduce_ms = 0;
    };

    void coordinator_loop();

    /** Run batch_reduce_verify on a subset of reduce results (identified by indices). */
    bool batch_ipa_verify(const std::vector<ReduceResult>& results, const std::vector<size_t>& indices);

    /** Bisect a failed IPA batch using cached claims. */
    void bisect_ipa(std::vector<ReduceResult>& results, std::vector<size_t> indices, uint32_t depth, double ipa_ms);

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks_;
    ResultCallback on_result_;
    uint32_t num_ipa_cores_ = 1;
    uint32_t num_sumcheck_cores_ = 1;
    uint32_t batch_size_ = 64;

    // Incoming individual requests
    std::deque<VerifyRequest> incoming_;
    // Accumulator: proofs waiting to form a full batch
    std::vector<VerifyRequest> accumulator_;
    // IDs marked for cancellation
    std::set<uint64_t> cancelled_ids_;

    std::thread coordinator_thread_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    bool shutdown_ = false;
    bool flush_requested_ = false;
};

} // namespace bb
#endif
