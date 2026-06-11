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
#include <atomic>
#include <mutex>
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
    void fail_request(uint64_t request_id, std::string error_message);
    void stop();
    bool is_running() const { return running_.load(); }

  private:
    bool write_result(VerifyResult result);
    bool ensure_fifo_open();
    void close_fifo_locked();
    bool fail_fifo_locked(const std::string& message);

    ChonkBatchVerifier verifier_;

    std::mutex fifo_mutex_;
    std::string fifo_path_;
    int fifo_fd_ = -1;
    std::atomic_bool running_ = false;
    std::atomic_bool fifo_failed_ = false;
};
#endif // __wasm__

} // namespace bb::bbapi
