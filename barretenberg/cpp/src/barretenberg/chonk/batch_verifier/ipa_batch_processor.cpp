#ifndef __wasm__
#include "ipa_batch_processor.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"

namespace bb {

void IPABatchProcessor::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                              uint32_t num_ipa_cores,
                              uint32_t num_sumcheck_cores,
                              uint32_t batch_size,
                              ResultCallback on_result)
{
    vks_ = std::move(vks);
    num_ipa_cores_ = std::max(1u, num_ipa_cores);
    num_sumcheck_cores_ = std::max(1u, num_sumcheck_cores);
    batch_size_ = std::max(1u, batch_size);
    on_result_ = std::move(on_result);
    shutdown_ = false;
    flush_requested_ = false;

    coordinator_thread_ = std::thread([this]() { coordinator_loop(); });
    info("IPABatchProcessor started with ",
         num_ipa_cores_,
         " IPA cores, ",
         num_sumcheck_cores_,
         " sumcheck workers, batch_size=",
         batch_size_);
}

void IPABatchProcessor::enqueue(VerifyRequest request)
{
    {
        std::lock_guard lock(mutex_);
        request.enqueue_time = std::chrono::steady_clock::now();
        incoming_.push_back(std::move(request));
    }
    cv_.notify_one();
}

bool IPABatchProcessor::cancel(uint64_t request_id)
{
    std::lock_guard lock(mutex_);

    // Check accumulator
    for (auto it = accumulator_.begin(); it != accumulator_.end(); ++it) {
        if (it->request_id == request_id) {
            on_result_(VerifyResult{
                .request_id = request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = it->source,
            });
            accumulator_.erase(it);
            return true;
        }
    }

    // Check incoming queue
    for (auto it = incoming_.begin(); it != incoming_.end(); ++it) {
        if (it->request_id == request_id) {
            on_result_(VerifyResult{
                .request_id = request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = it->source,
            });
            incoming_.erase(it);
            return true;
        }
    }

    // Mark for in-flight cancellation
    cancelled_ids_.insert(request_id);
    return false;
}

uint32_t IPABatchProcessor::cancel_by_source(const std::string& source)
{
    std::lock_guard lock(mutex_);
    uint32_t count = 0;

    auto cancel_from = [&](auto& container) {
        auto it = container.begin();
        while (it != container.end()) {
            if (it->source == source) {
                on_result_(VerifyResult{
                    .request_id = it->request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                    .source = source,
                });
                it = container.erase(it);
                count++;
            } else {
                ++it;
            }
        }
    };

    cancel_from(accumulator_);
    cancel_from(incoming_);

    return count;
}

void IPABatchProcessor::stop()
{
    {
        std::lock_guard lock(mutex_);
        flush_requested_ = true;
        shutdown_ = true;
    }
    cv_.notify_one();

    if (coordinator_thread_.joinable()) {
        coordinator_thread_.join();
    }

    info("IPABatchProcessor stopped");
}

IPABatchProcessor::~IPABatchProcessor()
{
    if (!shutdown_) {
        stop();
    }
}

/**
 * @brief Coordinator loop implementing the 3-phase pipeline:
 *
 * Phase 1 (Parallel Reduce): Run reduce_to_ipa_claim for each proof on num_sumcheck_cores worker threads.
 *   Each worker picks proofs via atomic index (work-stealing). Each runs with
 *   set_parallel_for_concurrency(1) since reduce_to_ipa_claim is single-threaded.
 *   Proofs that fail non-IPA checks are emitted as FAILED immediately.
 *
 * Phase 2 (Batch IPA Verify): Collect IPA claims from passed proofs, batch-verify via
 *   IPA::batch_reduce_verify using all IPA cores for the single large MSM.
 *
 * Phase 3 (Emit / Bisect): If IPA passes, emit OK for all. If IPA fails,
 *   bisect using cached claims (no re-reduction needed) to isolate bad proofs.
 */
void IPABatchProcessor::coordinator_loop()
{
    while (true) {
        // Wait for a full batch or shutdown flush
        std::vector<VerifyRequest> batch;
        {
            std::unique_lock lock(mutex_);
            cv_.wait(lock, [this] {
                if (shutdown_) {
                    return true;
                }
                return (accumulator_.size() + incoming_.size() >= batch_size_);
            });

            // Drain incoming into accumulator
            while (!incoming_.empty()) {
                accumulator_.push_back(std::move(incoming_.front()));
                incoming_.pop_front();
            }

            // Form batch (take up to batch_size_ from accumulator)
            if (accumulator_.size() >= batch_size_) {
                batch.insert(batch.end(),
                             std::make_move_iterator(accumulator_.begin()),
                             std::make_move_iterator(accumulator_.begin() + static_cast<ptrdiff_t>(batch_size_)));
                accumulator_.erase(accumulator_.begin(), accumulator_.begin() + static_cast<ptrdiff_t>(batch_size_));
            } else if (flush_requested_ && !accumulator_.empty()) {
                // On shutdown, flush partial accumulator
                batch = std::move(accumulator_);
                accumulator_.clear();
            }

            if (batch.empty()) {
                if (shutdown_) {
                    break;
                }
                continue;
            }
        }

        // Filter cancelled and invalid-VK requests before processing
        {
            std::lock_guard lock(mutex_);
            auto it = batch.begin();
            while (it != batch.end()) {
                bool remove = false;

                if (cancelled_ids_.count(it->request_id)) {
                    cancelled_ids_.erase(it->request_id);
                    on_result_(VerifyResult{
                        .request_id = it->request_id,
                        .verified = false,
                        .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                        .source = it->source,
                    });
                    remove = true;
                } else if (it->vk_index >= vks_.size()) {
                    on_result_(VerifyResult{
                        .request_id = it->request_id,
                        .verified = false,
                        .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                        .error_message = "invalid vk_index: " + std::to_string(it->vk_index),
                        .source = it->source,
                    });
                    remove = true;
                }

                if (remove) {
                    it = batch.erase(it);
                } else {
                    ++it;
                }
            }
        }

        if (batch.empty()) {
            if (shutdown_) {
                std::lock_guard lock(mutex_);
                if (incoming_.empty() && accumulator_.empty()) {
                    break;
                }
            }
            continue;
        }

        // ──────────────────────────────────────────────────────────────────────
        // Phase 1: Parallel reduce_to_ipa_claim
        // ──────────────────────────────────────────────────────────────────────
        // Each sumcheck worker thread picks proofs via atomic index and runs
        // reduce_to_ipa_claim with set_parallel_for_concurrency(1).

        const size_t num_proofs = batch.size();
        std::vector<ReduceResult> reduce_results(num_proofs);
        std::atomic<size_t> work_index{ 0 };

        uint32_t num_workers = std::min(num_sumcheck_cores_, static_cast<uint32_t>(num_proofs));
        std::vector<std::thread> workers;
        workers.reserve(num_workers);

        auto reduce_start = std::chrono::steady_clock::now();

        for (uint32_t w = 0; w < num_workers; ++w) {
            workers.emplace_back([&]() {
                // Each sumcheck worker is single-threaded
                set_parallel_for_concurrency(1);

                while (true) {
                    size_t idx = work_index.fetch_add(1, std::memory_order_relaxed);
                    if (idx >= num_proofs) {
                        break;
                    }

                    auto& req = batch[idx];
                    auto proof_start = std::chrono::steady_clock::now();

                    ChonkNativeVerifier verifier(vks_[req.vk_index]);
                    auto result = verifier.reduce_to_batch_ipa_claim(req.proof);

                    auto proof_end = std::chrono::steady_clock::now();
                    double reduce_ms = std::chrono::duration<double, std::milli>(proof_end - proof_start).count();

                    reduce_results[idx] = ReduceResult{
                        .request_id = req.request_id,
                        .source = req.source,
                        .deferred_ipa_claim = std::move(result.deferred_ipa_claim),
                        .ipa_proof = std::move(result.ipa_proof),
                        .all_checks_passed = result.all_checks_passed,
                        .error_message =
                            result.all_checks_passed ? "" : "verification failed (non-IPA checks in reduce phase)",
                        .enqueue_time = req.enqueue_time,
                        .reduce_ms = reduce_ms,
                    };
                }
            });
        }

        for (auto& t : workers) {
            t.join();
        }

        auto reduce_end = std::chrono::steady_clock::now();
        double total_reduce_ms = std::chrono::duration<double, std::milli>(reduce_end - reduce_start).count();

        // Separate into passed (need IPA) and failed (emit immediately)
        std::vector<size_t> passed_indices;
        passed_indices.reserve(num_proofs);

        for (size_t i = 0; i < num_proofs; ++i) {
            auto& rr = reduce_results[i];
            if (!rr.all_checks_passed) {
                // Emit FAILED for proofs that failed non-IPA checks
                double queue_ms = std::chrono::duration<double, std::milli>(reduce_start - rr.enqueue_time).count();
                on_result_(VerifyResult{
                    .request_id = rr.request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                    .error_message = rr.error_message,
                    .source = rr.source,
                    .time_in_queue_ms = queue_ms,
                    .time_in_verify_ms = rr.reduce_ms,
                    .time_in_sumcheck_ms = rr.reduce_ms,
                });
            } else {
                passed_indices.push_back(i);
            }
        }

        if (passed_indices.empty()) {
            // All proofs failed in reduce phase, nothing to IPA verify
            if (shutdown_) {
                std::lock_guard lock(mutex_);
                if (incoming_.empty() && accumulator_.empty()) {
                    break;
                }
            }
            continue;
        }

        // ──────────────────────────────────────────────────────────────────────
        // Phase 2: Batch IPA verify
        // ──────────────────────────────────────────────────────────────────────

        set_parallel_for_concurrency(num_ipa_cores_);

        auto ipa_start = std::chrono::steady_clock::now();
        bool ipa_ok = batch_ipa_verify(reduce_results, passed_indices);
        auto ipa_end = std::chrono::steady_clock::now();
        double ipa_ms = std::chrono::duration<double, std::milli>(ipa_end - ipa_start).count();

        info("IPABatchProcessor: batch of ",
             passed_indices.size(),
             " proofs: reduce=",
             total_reduce_ms,
             "ms, IPA=",
             ipa_ms,
             "ms, result=",
             ipa_ok ? "OK" : "FAILED");

        // ──────────────────────────────────────────────────────────────────────
        // Phase 3: Emit results or bisect
        // ──────────────────────────────────────────────────────────────────────

        if (ipa_ok) {
            // All passed — emit OK (check late cancellations)
            std::lock_guard lock(mutex_);
            for (size_t idx : passed_indices) {
                auto& rr = reduce_results[idx];
                if (cancelled_ids_.count(rr.request_id)) {
                    cancelled_ids_.erase(rr.request_id);
                    on_result_(VerifyResult{
                        .request_id = rr.request_id,
                        .verified = false,
                        .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                        .source = rr.source,
                    });
                } else {
                    double queue_ms = std::chrono::duration<double, std::milli>(reduce_start - rr.enqueue_time).count();
                    on_result_(VerifyResult{
                        .request_id = rr.request_id,
                        .verified = true,
                        .status = static_cast<uint8_t>(VerifyStatus::OK),
                        .source = rr.source,
                        .time_in_queue_ms = queue_ms,
                        .time_in_verify_ms = rr.reduce_ms + ipa_ms,
                        .time_in_sumcheck_ms = rr.reduce_ms,
                        .time_in_ipa_ms = ipa_ms,
                    });
                }
            }
        } else {
            // IPA batch failed — bisect using cached claims
            bisect_ipa(reduce_results, passed_indices, /*depth=*/0, ipa_ms);
        }

        // Check if we should continue after shutdown
        if (shutdown_) {
            std::lock_guard lock(mutex_);
            if (incoming_.empty() && accumulator_.empty()) {
                break;
            }
        }
    }
}

bool IPABatchProcessor::batch_ipa_verify(const std::vector<ReduceResult>& results, const std::vector<size_t>& indices)
{
    if (indices.empty()) {
        return true;
    }

    std::vector<OpeningClaim<curve::Grumpkin>> claims;
    std::vector<std::shared_ptr<NativeTranscript>> transcripts;
    claims.reserve(indices.size());
    transcripts.reserve(indices.size());

    for (size_t idx : indices) {
        // Finalize each deferred ECCVM Shplonk MSM to produce an IPA opening claim
        claims.push_back(results[idx].deferred_ipa_claim.finalize());
        transcripts.push_back(std::make_shared<NativeTranscript>(results[idx].ipa_proof));
    }

    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    return IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, claims, transcripts);
}

/**
 * @brief Bisect a failed IPA batch using cached claims (no re-reduction needed).
 *
 * Recursively splits the index set in half and re-verifies each half.
 * - If a half passes, emit OK for all proofs in it.
 * - If a half fails and has >1 proof, recurse.
 * - If a half fails and has 1 proof, emit FAILED.
 *
 * This is O(log N) IPA verifications to isolate bad proofs, and reuses
 * the cached ReduceResult claims from Phase 1 (no re-running reduce_to_ipa_claim).
 */
void IPABatchProcessor::bisect_ipa(std::vector<ReduceResult>& results,
                                   std::vector<size_t> indices,
                                   uint32_t depth,
                                   double ipa_ms)
{
    if (indices.size() == 1) {
        // Single proof — definitely bad
        auto& rr = results[indices[0]];
        double queue_ms =
            std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - rr.enqueue_time).count();
        on_result_(VerifyResult{
            .request_id = rr.request_id,
            .verified = false,
            .status = static_cast<uint8_t>(VerifyStatus::FAILED),
            .error_message = "IPA verification failed (bisected to individual)",
            .source = rr.source,
            .time_in_queue_ms = queue_ms,
            .time_in_verify_ms = rr.reduce_ms + ipa_ms,
            .time_in_sumcheck_ms = rr.reduce_ms,
            .time_in_ipa_ms = ipa_ms,
            .batch_failure_count = depth + 1,
        });
        return;
    }

    info("IPABatchProcessor: bisecting ", indices.size(), " proofs at depth ", depth);

    size_t mid = indices.size() / 2;
    std::vector<size_t> left(indices.begin(), indices.begin() + static_cast<ptrdiff_t>(mid));
    std::vector<size_t> right(indices.begin() + static_cast<ptrdiff_t>(mid), indices.end());

    // Verify each half
    set_parallel_for_concurrency(num_ipa_cores_);

    auto left_start = std::chrono::steady_clock::now();
    bool left_ok = batch_ipa_verify(results, left);
    auto left_end = std::chrono::steady_clock::now();
    double left_ipa_ms = std::chrono::duration<double, std::milli>(left_end - left_start).count();

    auto right_start = std::chrono::steady_clock::now();
    bool right_ok = batch_ipa_verify(results, right);
    auto right_end = std::chrono::steady_clock::now();
    double right_ipa_ms = std::chrono::duration<double, std::milli>(right_end - right_start).count();

    // Process left half
    if (left_ok) {
        std::lock_guard lock(mutex_);
        for (size_t idx : left) {
            auto& rr = results[idx];
            if (cancelled_ids_.count(rr.request_id)) {
                cancelled_ids_.erase(rr.request_id);
                on_result_(VerifyResult{
                    .request_id = rr.request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                    .source = rr.source,
                });
            } else {
                double queue_ms =
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - rr.enqueue_time)
                        .count();
                on_result_(VerifyResult{
                    .request_id = rr.request_id,
                    .verified = true,
                    .status = static_cast<uint8_t>(VerifyStatus::OK),
                    .source = rr.source,
                    .time_in_queue_ms = queue_ms,
                    .time_in_verify_ms = rr.reduce_ms + left_ipa_ms,
                    .time_in_sumcheck_ms = rr.reduce_ms,
                    .time_in_ipa_ms = left_ipa_ms,
                    .batch_failure_count = depth + 1,
                });
            }
        }
    } else {
        bisect_ipa(results, std::move(left), depth + 1, left_ipa_ms);
    }

    // Process right half
    if (right_ok) {
        std::lock_guard lock(mutex_);
        for (size_t idx : right) {
            auto& rr = results[idx];
            if (cancelled_ids_.count(rr.request_id)) {
                cancelled_ids_.erase(rr.request_id);
                on_result_(VerifyResult{
                    .request_id = rr.request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                    .source = rr.source,
                });
            } else {
                double queue_ms =
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - rr.enqueue_time)
                        .count();
                on_result_(VerifyResult{
                    .request_id = rr.request_id,
                    .verified = true,
                    .status = static_cast<uint8_t>(VerifyStatus::OK),
                    .source = rr.source,
                    .time_in_queue_ms = queue_ms,
                    .time_in_verify_ms = rr.reduce_ms + right_ipa_ms,
                    .time_in_sumcheck_ms = rr.reduce_ms,
                    .time_in_ipa_ms = right_ipa_ms,
                    .batch_failure_count = depth + 1,
                });
            }
        }
    } else {
        bisect_ipa(results, std::move(right), depth + 1, right_ipa_ms);
    }
}

} // namespace bb
#endif
