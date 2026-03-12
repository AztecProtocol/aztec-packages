#ifndef __wasm__
#pragma once
/**
 * @file chonk_batch_verifier_service.hpp
 * @brief Batch IVC proof verification service.
 *
 * Two-class architecture:
 * - IPABatchProcessor: 3-phase batch verification pipeline
 * - ChonkBatchVerifierService: owns FIFO writer, lifecycle management
 *
 * ## Batch Verification Pipeline (IPABatchProcessor)
 *
 * 3-phase pipeline optimized for minimum latency:
 * 1. Parallel reduce: Run reduce_to_ipa_claim for each proof using work-stealing.
 * 2. Batch check: Aggregate pairing points + batch IPA verify in one shot.
 * 3. Emit / bisect: If batch passes, emit OK. If it fails, bisect using cached claims.
 *
 * ## Result Streaming
 *
 * Results are streamed as size-delimited msgpack over a named FIFO pipe.
 * Each message is [4-byte big-endian length][msgpack payload].
 */

#include "batch_verifier_types.hpp"
#include "ipa_batch_processor.hpp"

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

    /** Queue a proof for batch verification. */
    bool queue(VerifyRequest request);

    /** Cancel a pending request by ID. */
    bool cancel(uint64_t request_id);

    /** Stop the processor, flush remaining work, close FIFO. */
    void stop();

    ~ChonkBatchVerifierService();

  private:
    void emit_result(VerifyResult result);
    void writer_loop();

    IPABatchProcessor processor_;

    // Result queue (fed by processor via emit_result callback)
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
