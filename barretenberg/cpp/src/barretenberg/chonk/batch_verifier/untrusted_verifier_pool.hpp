#ifndef __wasm__
#pragma once
/**
 * @file untrusted_verifier_pool.hpp
 * @brief Dedicated threadpool for individual (non-batched) proof verification.
 *
 * Each untrusted proof is verified individually on a worker thread from a fixed-size pool.
 * No batching — the caller can promote sources to trusted for batch verification.
 */

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

class UntrustedVerifierPool {
  public:
    using ResultCallback = std::function<void(VerifyResult)>;

    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               uint32_t num_threads,
               ResultCallback on_result);

    void enqueue(VerifyRequest request);
    bool cancel(uint64_t request_id);
    uint32_t cancel_by_source(const std::string& source);
    void stop();
    ~UntrustedVerifierPool();

  private:
    void worker_loop();

    std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks_;
    ResultCallback on_result_;

    std::deque<VerifyRequest> queue_;
    std::set<uint64_t> cancelled_ids_;

    std::vector<std::thread> workers_;
    std::mutex mutex_;
    std::condition_variable cv_;
    bool shutdown_ = false;
};

} // namespace bb
#endif
