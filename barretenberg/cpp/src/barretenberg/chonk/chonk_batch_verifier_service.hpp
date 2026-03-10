#ifndef __wasm__
#pragma once
/**
 * @file chonk_batch_verifier_service.hpp
 * @brief Adaptive batch IVC proof verification service.
 *
 * Implements a long-lived verification service that accepts proof verification requests
 * and streams results back via a named FIFO pipe. Designed for benchmarking and production
 * use of IVC batch verification with trust-aware batching.
 *
 * ## Algorithm Overview
 *
 * Proofs are categorized as **trusted** or **untrusted**:
 *
 * - **Trusted proofs** are batched into large groups (configurable `trusted_batch_size`).
 *   IPA opening claims are combined via random linear combination into a single SRS MSM,
 *   giving ~Nx speedup on the IPA bottleneck. If a trusted batch fails, binary search
 *   (bisection) identifies the bad proof(s) in O(log N) re-verifications.
 *
 * - **Untrusted proofs** are verified individually (batch_size=1) on their own threads.
 *   We oversubscribe threads (more than CPUs) so the OS can schedule them, similar to
 *   the aztec_process VK generation pattern.
 *
 * ## Source-Based Cancellation
 *
 * Each proof carries an optional `source` string (e.g., peer ID, IP address).
 * The TypeScript caller controls trust decisions: when a bad proof result is received,
 * TS can cancel all remaining proofs from that source via CancelBySource. This keeps
 * the C++ side simple — it just verifies and reports, TS handles policy.
 *
 * ## Threading Model
 *
 * - Caller thread: processes incoming Queue/Cancel commands, forms trusted batches
 * - Worker threads: run verification (use set_parallel_for_concurrency for nested parallelism)
 * - Writer thread: drains result queue and writes size-delimited msgpack to output FIFO
 *
 * ## Result Streaming
 *
 * Results are streamed as size-delimited msgpack objects over a named FIFO pipe.
 * Each message is [4-byte big-endian length][msgpack payload].
 */

#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <mutex>
#include <set>
#include <string>
#include <thread>
#include <vector>

namespace bb {

/**
 * @brief Configuration for the batch verifier service.
 */
struct BatchVerifierConfig {
    /** Number of worker threads for untrusted verification. */
    uint32_t num_threads = 8;
    /** Number of trusted proofs to accumulate before batch-verifying. */
    uint32_t trusted_batch_size = 64;
    /** Number of untrusted proofs per batch (1 = individual verification). */
    uint32_t untrusted_batch_size = 1;
    /** Maximum number of pending requests before backpressure. */
    uint32_t max_pending = 1024;

    MSGPACK_FIELDS(num_threads, trusted_batch_size, untrusted_batch_size, max_pending);
    bool operator==(const BatchVerifierConfig&) const = default;
};

/**
 * @brief Status of a verification result.
 */
enum class VerifyStatus : uint8_t {
    OK = 0,
    FAILED = 1,
    CANCELLED = 2,
};

/**
 * @brief Result of a single proof verification, written to the output FIFO.
 */
struct VerifyResult {
    uint64_t request_id = 0;
    bool verified = false;
    uint8_t status = 0; // VerifyStatus as uint8_t for msgpack
    std::string error_message;
    std::string source;
    double time_in_queue_ms = 0;
    double time_in_sumcheck_ms = 0;
    double time_in_ipa_ms = 0;
    uint32_t batch_failure_count = 0;

    MSGPACK_FIELDS(request_id,
                   verified,
                   status,
                   error_message,
                   source,
                   time_in_queue_ms,
                   time_in_sumcheck_ms,
                   time_in_ipa_ms,
                   batch_failure_count);
};

/**
 * @brief Internal representation of a queued verification request.
 */
struct VerifyRequest {
    uint64_t request_id = 0;
    ChonkProof proof;
    uint32_t vk_index = 0;
    bool trusted = false;
    std::string source;
    std::chrono::steady_clock::time_point enqueue_time;
};

/**
 * @brief Long-lived batch verification service.
 *
 * Accepts proof verification requests via queue(), forms batches based on trust level,
 * verifies them on worker threads, and streams results to a named FIFO pipe.
 * Trust policy (banning sources, etc.) is managed by the TypeScript caller.
 */
class ChonkBatchVerifierService {
  public:
    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               const std::string& output_fifo_path,
               const BatchVerifierConfig& config);

    /** @brief Queue a proof for verification. Returns true if accepted. */
    bool queue(VerifyRequest request);

    /** @brief Cancel a pending request by ID. */
    bool cancel(uint64_t request_id);

    /** @brief Cancel all pending requests from a given source. Returns count cancelled. */
    uint32_t cancel_by_source(const std::string& source);

    /** @brief Stop the service, flush remaining work, join threads. */
    void stop();

    ~ChonkBatchVerifierService();

  private:
    // Flush the trusted buffer into a batch verification job
    void flush_trusted_batch();

    // Verify a batch of trusted proofs (runs on worker thread)
    void verify_trusted_batch(std::vector<VerifyRequest> batch);

    // Bisect a failed trusted batch to find bad proofs
    void bisect(std::vector<VerifyRequest> batch, uint32_t failure_depth);

    // Verify a single untrusted proof (runs on worker thread)
    void verify_untrusted(VerifyRequest request);

    // Emit a result to the output queue
    void emit_result(VerifyResult result);

    // Writer thread main loop
    void writer_loop();

    // Configuration
    BatchVerifierConfig config_;

    // Verification keys (indexed by vk_index)
    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks_;

    // Trusted proof buffer (accumulates until batch_size reached)
    std::vector<VerifyRequest> trusted_buffer_;

    // Set of request IDs marked for cancellation
    std::set<uint64_t> cancelled_ids_;

    // Result queue (written by workers, drained by writer thread)
    std::deque<VerifyResult> result_queue_;

    // Synchronization
    mutable std::mutex mutex_; // Protects trusted_buffer_, cancelled_ids_
    std::mutex result_mutex_;  // Protects result_queue_
    std::condition_variable result_cv_;

    // Worker threads
    std::vector<std::thread> workers_;
    std::thread writer_thread_;

    // Output FIFO file descriptor
    int output_fd_ = -1;

    // Shutdown flag
    std::atomic<bool> shutdown_{ false };

    // Count of in-flight work (for graceful shutdown)
    std::atomic<uint32_t> inflight_count_{ 0 };
};

} // namespace bb
#endif
