#ifndef __wasm__
#pragma once
/**
 * @file ipa_batch_processor.hpp
 * @brief Trusted batch proof verification with unified threading and bisection.
 *
 * All available cores are used for whichever phase is active:
 *   Phase 1: Parallel per-proof reduction (work-stealing, each worker single-threaded)
 *   Phase 2: Unified batch check (pairing aggregation + batch IPA verify)
 *
 * If ANY batched operation fails (pairing or IPA), the entire batch is bisected
 * recursively using cached reduction results — no re-reduction needed.
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
               uint32_t num_cores,
               uint32_t batch_size,
               ResultCallback on_result);

    void enqueue(VerifyRequest request);
    bool cancel(uint64_t request_id);
    uint32_t cancel_by_source(const std::string& source);
    void stop();
    ~IPABatchProcessor();

  private:
    using DeferredIPAClaim = ChonkNativeVerifier::DeferredIPAClaim;
    using NativePairingPoints = bb::PairingPoints<curve::BN254>;

    /** Cached reduction result for a single proof (reused during bisection). */
    struct ReduceResult {
        uint64_t request_id = 0;
        std::string source;
        DeferredIPAClaim deferred_ipa_claim;
        HonkProof ipa_proof;
        NativePairingPoints mega_pcs_pairing_points;
        NativePairingPoints merge_pairing_points;
        NativePairingPoints translator_pairing_points;
        bool all_checks_passed = false;
        std::string error_message;
        std::chrono::steady_clock::time_point enqueue_time;
        double reduce_ms = 0;
    };

    void coordinator_loop();

    /**
     * @brief Unified batch check: pairing aggregation + batch IPA verify.
     * @return true if all proofs in the index set are valid.
     */
    bool batch_check(const std::vector<ReduceResult>& results, const std::vector<size_t>& indices);

    /**
     * @brief Unified bisection for any batch failure (pairing or IPA).
     * Recursively splits the batch and re-checks each half using cached results.
     */
    void bisect(std::vector<ReduceResult>& results,
                std::vector<size_t> indices,
                uint32_t depth,
                std::chrono::steady_clock::time_point reduce_start);

    /** Emit OK for all proofs in the index set (checking late cancellations). */
    void emit_ok(const std::vector<ReduceResult>& results,
                 const std::vector<size_t>& indices,
                 std::chrono::steady_clock::time_point reduce_start,
                 double ipa_ms,
                 uint32_t depth);

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks_;
    ResultCallback on_result_;
    uint32_t num_cores_ = 1;
    uint32_t batch_size_ = 64;

    std::deque<VerifyRequest> incoming_;
    std::vector<VerifyRequest> accumulator_;
    std::set<uint64_t> cancelled_ids_;

    std::thread coordinator_thread_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    bool shutdown_ = false;
    bool flush_requested_ = false;
};

} // namespace bb
#endif
