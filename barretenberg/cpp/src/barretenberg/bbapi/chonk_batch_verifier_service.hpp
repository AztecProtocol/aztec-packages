#pragma once
#ifndef __wasm__
#include "barretenberg/chonk/batch_verifier/batch_verifier_types.hpp"
#include "barretenberg/chonk/batch_verifier/chonk_batch_verifier.hpp"

#include <condition_variable>
#include <mutex>
#include <queue>
#include <string>
#include <thread>

namespace bb {

/**
 * @brief FIFO-streaming batch verification service for Chonk proofs.
 *
 * Wraps ChonkBatchVerifier and streams results over a named pipe (FIFO)
 * as size-delimited msgpack payloads: [4-byte big-endian length][msgpack payload].
 *
 * Lifecycle: start() → enqueue() × N → stop()
 */
class ChonkBatchVerifierService {
  public:
    ChonkBatchVerifierService() = default;
    ~ChonkBatchVerifierService();

    ChonkBatchVerifierService(const ChonkBatchVerifierService&) = delete;
    ChonkBatchVerifierService& operator=(const ChonkBatchVerifierService&) = delete;

    /**
     * @brief Start the service.
     * @param vks Verification keys (indexed by VerifyRequest::vk_index)
     * @param config Pipeline configuration
     * @param fifo_path Path to the named pipe for streaming results
     */
    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               BatchVerifierConfig config,
               const std::string& fifo_path);

    /**
     * @brief Enqueue a proof for verification.
     */
    void enqueue(VerifyRequest request);

    /**
     * @brief Stop the service and flush remaining results.
     */
    void stop();

    bool is_running() const { return running_; }

  private:
    void writer_loop(const std::string& fifo_path);

    ChonkBatchVerifier verifier_;

    // Result queue for the writer thread
    std::mutex result_mutex_;
    std::condition_variable result_cv_;
    std::queue<VerifyResult> result_queue_;
    bool writer_shutdown_ = false;
    std::thread writer_thread_;

    bool running_ = false;
};

} // namespace bb
#endif // __wasm__
