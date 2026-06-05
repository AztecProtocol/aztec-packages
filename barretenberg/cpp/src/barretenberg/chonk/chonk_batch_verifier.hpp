#pragma once
#ifndef __wasm__
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/flavor/mega_zk_flavor.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "batch_verifier_types.hpp"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <thread>
#include <unordered_set>
#include <vector>

namespace bb {

/**
 * @brief Asynchronous batch verifier for Chonk IVC proofs.
 *
 * Pipeline:
 *   Phase 1 (parallel reduce): Work-stealing threads each run full non-IPA verification
 *                               (MegaZK sumcheck, databus, Goblin merge/eccvm/translator).
 *   Phase 2 (batch check):     Batch IPA verification via IPA::batch_reduce_verify on all passed proofs.
 *   Phase 3 (emit/bisect):     On success, emit OK for all. On failure, binary-search to isolate bad proofs.
 */
class ChonkBatchVerifier {
  public:
    using ResultCallback = std::function<void(VerifyResult)>;
    static constexpr size_t MAX_QUEUE_SIZE = 1024;

    /**
     * @brief Per-proof result from the reduce phase.
     */
    struct ReduceResult {
        uint64_t request_id = 0;
        OpeningClaim<curve::Grumpkin> ipa_claim;
        ::bb::HonkProof ipa_proof;
        bool all_checks_passed = false;
        std::string error_message;
        std::chrono::steady_clock::time_point enqueue_time;
        double reduce_ms = 0;
    };

    ChonkBatchVerifier() = default;
    ~ChonkBatchVerifier();

    ChonkBatchVerifier(const ChonkBatchVerifier&) = delete;
    ChonkBatchVerifier& operator=(const ChonkBatchVerifier&) = delete;

    /**
     * @brief Start the coordinator thread.
     * @param vks Verification keys indexed by VerifyRequest::vk_index
     * @param num_cores Number of cores for parallel reduce
     * @param batch_size Number of proofs to accumulate before batch-checking
     * @param on_result Callback invoked for each completed verification
     */
    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               uint32_t num_cores,
               uint32_t batch_size,
               ResultCallback on_result);

    /**
     * @brief Enqueue a proof for verification.
     */
    void enqueue(VerifyRequest request);

    /**
     * @brief Stop the processor, flushing remaining proofs.
     */
    void stop();

  private:
    void coordinator_loop();
    void dispatch(VerifyResult result);
    std::vector<ReduceResult> parallel_reduce(const std::vector<VerifyRequest>& batch);
    bool batch_check(const std::vector<ReduceResult>& results, const std::vector<size_t>& indices);
    void bisect(std::vector<ReduceResult>& results,
                std::vector<size_t> indices,
                uint32_t depth,
                std::chrono::steady_clock::time_point reduce_start);
    void emit_ok(const std::vector<ReduceResult>& results,
                 const std::vector<size_t>& indices,
                 std::chrono::steady_clock::time_point reduce_start,
                 double ipa_ms,
                 uint32_t depth);

    static double ms_since(std::chrono::steady_clock::time_point t)
    {
        return std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t).count();
    }
    static double ms_between(std::chrono::steady_clock::time_point from, std::chrono::steady_clock::time_point to)
    {
        return std::chrono::duration<double, std::milli>(to - from).count();
    }

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks_;
    uint32_t num_cores_ = 1;
    uint32_t batch_size_ = 8;
    ResultCallback on_result_;

    std::mutex mutex_;
    std::condition_variable cv_;
    std::condition_variable stopped_cv_;
    std::deque<VerifyRequest> queue_;
    std::unordered_set<uint64_t> in_flight_ids_;
    bool running_ = false;
    bool shutdown_ = false;
    bool stopping_ = false;
    std::thread coordinator_thread_;
};

} // namespace bb
#endif // __wasm__
