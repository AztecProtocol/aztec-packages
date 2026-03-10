#ifndef __wasm__
#pragma once
/**
 * @file chonk_batch_verifier_service.hpp
 * @brief Batch IVC proof verification service.
 *
 * Three-class architecture:
 * - UntrustedVerifierPool: dedicated threadpool for individual untrusted proof verification
 * - BatchTurnProcessor: turn-based trusted batch verification with cross-turn bisection
 * - ChonkBatchVerifierService: routes requests, owns FIFO writer, lifecycle management
 *
 * ## Trusted Verification (BatchTurnProcessor)
 *
 * Proofs are accumulated until batch_size, then verified as a batch using batched IPA.
 * If a batch fails, it's split in half and both halves are re-queued for the next turn.
 * This continues until individual bad proofs are isolated (O(log N) re-verifications).
 *
 * ## Untrusted Verification (UntrustedVerifierPool)
 *
 * Each proof is verified individually on a dedicated thread from a fixed-size pool.
 * No batching. The caller can promote sources to trusted.
 *
 * ## Source-Based Cancellation
 *
 * Each proof carries an optional `source` string (e.g., peer ID).
 * The TypeScript caller controls trust decisions: CancelBySource cancels all
 * pending proofs from a source across both pools.
 *
 * ## Result Streaming
 *
 * Results are streamed as size-delimited msgpack over a named FIFO pipe.
 * Each message is [4-byte big-endian length][msgpack payload].
 */

#include "batch_turn_processor.hpp"
#include "batch_verifier_types.hpp"
#include "untrusted_verifier_pool.hpp"

#include <atomic>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <thread>

namespace bb {

class ChonkBatchVerifierService {
  public:
    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               const std::string& output_fifo_path,
               const BatchVerifierConfig& config);

    /** @brief Queue a proof for verification. Routes to trusted or untrusted pool. */
    bool queue(VerifyRequest request);

    /** @brief Cancel a pending request by ID (searches both pools). */
    bool cancel(uint64_t request_id);

    /** @brief Cancel all pending requests from a source (both pools). Returns count. */
    uint32_t cancel_by_source(const std::string& source);

    /** @brief Stop both pools, flush remaining work, close FIFO. */
    void stop();

    ~ChonkBatchVerifierService();

  private:
    void emit_result(VerifyResult result);
    void writer_loop();

    BatchTurnProcessor trusted_processor_;
    UntrustedVerifierPool untrusted_pool_;

    // Result queue (fed by both processors via emit_result callback)
    std::deque<VerifyResult> result_queue_;
    std::mutex result_mutex_;
    std::condition_variable result_cv_;

    // Writer thread + FIFO
    std::thread writer_thread_;
    int output_fd_ = -1;
    std::atomic<bool> shutdown_{ false };
};

} // namespace bb
#endif
