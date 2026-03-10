#ifndef __wasm__
#pragma once
/**
 * @file batch_turn_processor.hpp
 * @brief Turn-based trusted batch proof verification with cross-turn bisection.
 *
 * Each "turn" of the background loop:
 * 1. Drain incoming queue + pending bisection halves
 * 2. Form batches from accumulated proofs (up to N batches for N cores)
 * 3. Verify all batches in parallel (each gets ceil(cores/batches) threads)
 * 4. Passed batches → emit OK results
 * 5. Failed batches → split in half → re-queue for next turn
 * 6. Single-proof failures → emit FAILED
 *
 * Uses ChonkBatchVerifier::verify() for batch verification (batched IPA).
 */

#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "batch_verifier_types.hpp"

#include <condition_variable>
#include <deque>
#include <functional>
#include <mutex>
#include <set>
#include <thread>
#include <vector>

namespace bb {

class BatchTurnProcessor {
  public:
    using ResultCallback = std::function<void(VerifyResult)>;

    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               uint32_t num_cores,
               uint32_t batch_size,
               ResultCallback on_result);

    void enqueue(VerifyRequest request);
    bool cancel(uint64_t request_id);
    uint32_t cancel_by_source(const std::string& source);

    /** Flush accumulator (even if not full), process remaining work, join. */
    void stop();
    ~BatchTurnProcessor();

  private:
    /** A batch of requests to verify together, with bisection tracking. */
    struct Batch {
        std::vector<VerifyRequest> requests;
        uint32_t bisection_depth = 0;
    };

    void turn_loop();

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks_;
    ResultCallback on_result_;
    uint32_t num_cores_ = 1;
    uint32_t batch_size_ = 64;

    // Incoming individual requests (from caller)
    std::deque<VerifyRequest> incoming_;
    // Accumulator: proofs waiting to form a full batch
    std::vector<VerifyRequest> accumulator_;
    // Pre-formed batches ready for verification (fresh + bisection halves)
    std::deque<Batch> pending_batches_;
    // IDs marked for cancellation
    std::set<uint64_t> cancelled_ids_;

    std::thread turn_thread_;
    mutable std::mutex mutex_;
    std::condition_variable cv_;
    bool shutdown_ = false;
    bool flush_requested_ = false;
};

} // namespace bb
#endif
