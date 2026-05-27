#pragma once
/**
 * @file bbapi_chonk.hpp
 * @brief Stateful Chonk batch-verifier service used by the IPC handlers.
 *
 * The IPC command structs themselves are gone — the codegen-emitted wire
 * types are the source of truth, and the bodies live in bbapi_chonk.cpp as
 * `handle_chonk_*` functions matching the codegen dispatch signature.
 *
 * This header keeps the `ChonkBatchVerifierService` class definition because
 * `BBApiRequest::batch_verifier_service` holds a `shared_ptr<...>` to it.
 */
#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#ifndef __wasm__
#include "barretenberg/chonk/batch_verifier_types.hpp"
#include "barretenberg/chonk/chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_proof.hpp"
#include <condition_variable>
#include <mutex>
#include <queue>
#include <thread>
#endif

#include <string>
#include <vector>

namespace bb::bbapi {

#ifndef __wasm__
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

    void start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
               uint32_t num_cores,
               uint32_t batch_size,
               const std::string& fifo_path);
    void enqueue(VerifyRequest request);
    void stop();
    bool is_running() const { return running_; }

  private:
    void writer_loop(const std::string& fifo_path);

    ChonkBatchVerifier verifier_;

    std::mutex result_mutex_;
    std::condition_variable result_cv_;
    std::queue<VerifyResult> result_queue_;
    bool writer_shutdown_ = false;
    std::thread writer_thread_;

    bool running_ = false;
};
#endif // __wasm__

} // namespace bb::bbapi
