#ifndef __wasm__
#pragma once
/**
 * @file chonk_batch_verifier_service.hpp
 * @brief Batch IVC proof verification service with FIFO result streaming.
 *
 * Owns an IPABatchProcessor and a writer thread that streams results as
 * size-delimited msgpack over a named FIFO pipe: [4-byte BE length][msgpack payload].
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
