#ifndef __wasm__
#include "ipa_batch_processor.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"

namespace bb {

void IPABatchProcessor::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                              uint32_t num_cores,
                              uint32_t batch_size,
                              ResultCallback on_result)
{
    vks_ = std::move(vks);
    num_cores_ = std::max(1u, num_cores);
    batch_size_ = std::max(1u, batch_size);
    on_result_ = std::move(on_result);
    shutdown_ = false;
    flush_requested_ = false;

    coordinator_thread_ = std::thread([this]() { coordinator_loop(); });
    info("IPABatchProcessor started with ", num_cores_, " cores, batch_size=", batch_size_);
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

void IPABatchProcessor::coordinator_loop()
{
    while (true) {
        std::vector<VerifyRequest> batch;
        {
            std::unique_lock lock(mutex_);
            cv_.wait(lock, [this] { return shutdown_ || (accumulator_.size() + incoming_.size() >= batch_size_); });

            while (!incoming_.empty()) {
                accumulator_.push_back(std::move(incoming_.front()));
                incoming_.pop_front();
            }

            if (accumulator_.size() >= batch_size_) {
                batch.insert(batch.end(),
                             std::make_move_iterator(accumulator_.begin()),
                             std::make_move_iterator(accumulator_.begin() + static_cast<ptrdiff_t>(batch_size_)));
                accumulator_.erase(accumulator_.begin(), accumulator_.begin() + static_cast<ptrdiff_t>(batch_size_));
            } else if (flush_requested_ && !accumulator_.empty()) {
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

        // Filter cancelled and invalid-VK requests
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

        // ── Phase 1: parallel reduce (all cores, work-stealing) ──────────────
        const size_t num_proofs = batch.size();
        std::vector<ReduceResult> reduce_results(num_proofs);
        std::atomic<size_t> work_index{ 0 };
        auto reduce_start = std::chrono::steady_clock::now();

        uint32_t num_workers = std::min(num_cores_, static_cast<uint32_t>(num_proofs));
        std::vector<std::thread> workers;
        workers.reserve(num_workers);

        for (uint32_t w = 0; w < num_workers; ++w) {
            workers.emplace_back([&]() {
                set_parallel_for_concurrency(1);
                while (true) {
                    size_t idx = work_index.fetch_add(1, std::memory_order_relaxed);
                    if (idx >= num_proofs) {
                        break;
                    }
                    auto& req = batch[idx];
                    auto t0 = std::chrono::steady_clock::now();
                    ChonkNativeVerifier verifier(vks_[req.vk_index]);
                    auto result = verifier.reduce_to_batch_ipa_claim(req.proof);
                    double ms =
                        std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - t0).count();
                    reduce_results[idx] = ReduceResult{
                        .request_id = req.request_id,
                        .source = req.source,
                        .deferred_ipa_claim = std::move(result.deferred_ipa_claim),
                        .ipa_proof = std::move(result.ipa_proof),
                        .mega_pcs_pairing_points = std::move(result.mega_pcs_pairing_points),
                        .merge_pairing_points = std::move(result.merge_pairing_points),
                        .translator_pairing_points = std::move(result.translator_pairing_points),
                        .all_checks_passed = result.all_checks_passed,
                        .error_message = result.all_checks_passed ? "" : "reduction failed",
                        .enqueue_time = req.enqueue_time,
                        .reduce_ms = ms,
                    };
                }
            });
        }
        for (auto& t : workers) {
            t.join();
        }

        auto reduce_end = std::chrono::steady_clock::now();
        double reduce_ms = std::chrono::duration<double, std::milli>(reduce_end - reduce_start).count();

        // Separate passed from failed (emit failures immediately)
        std::vector<size_t> passed_indices;
        passed_indices.reserve(num_proofs);
        for (size_t i = 0; i < num_proofs; ++i) {
            auto& rr = reduce_results[i];
            if (!rr.all_checks_passed) {
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
            if (shutdown_) {
                std::lock_guard lock(mutex_);
                if (incoming_.empty() && accumulator_.empty()) {
                    break;
                }
            }
            continue;
        }

        // ── Phase 2: unified batch check (pairing + IPA) ────────────────────
        set_parallel_for_concurrency(num_cores_);

        auto ipa_start = std::chrono::steady_clock::now();
        bool ok = batch_check(reduce_results, passed_indices);
        auto ipa_end = std::chrono::steady_clock::now();
        double ipa_ms = std::chrono::duration<double, std::milli>(ipa_end - ipa_start).count();

        info("IPABatchProcessor: batch of ",
             passed_indices.size(),
             ": reduce=",
             reduce_ms,
             "ms, batch_check=",
             ipa_ms,
             "ms, result=",
             ok ? "OK" : "BISECTING");

        if (ok) {
            emit_ok(reduce_results, passed_indices, reduce_start, ipa_ms, 0);
        } else {
            bisect(reduce_results, passed_indices, 0, reduce_start);
        }

        if (shutdown_) {
            std::lock_guard lock(mutex_);
            if (incoming_.empty() && accumulator_.empty()) {
                break;
            }
        }
    }
}

bool IPABatchProcessor::batch_check(const std::vector<ReduceResult>& results, const std::vector<size_t>& indices)
{
    if (indices.empty()) {
        return true;
    }

    // Step 1: aggregate and check pairings
    NativePairingPoints aggregated;
    for (size_t idx : indices) {
        auto& rr = results[idx];
        aggregated.aggregate(rr.mega_pcs_pairing_points);
        aggregated.aggregate(rr.merge_pairing_points);
        aggregated.aggregate(rr.translator_pairing_points);
    }
    if (!aggregated.check()) {
        return false;
    }

    // Step 2: batch IPA verify
    std::vector<OpeningClaim<curve::Grumpkin>> claims;
    std::vector<std::shared_ptr<NativeTranscript>> transcripts;
    claims.reserve(indices.size());
    transcripts.reserve(indices.size());
    for (size_t idx : indices) {
        claims.push_back(results[idx].deferred_ipa_claim.finalize());
        transcripts.push_back(std::make_shared<NativeTranscript>(results[idx].ipa_proof));
    }

    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    return IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, claims, transcripts);
}

void IPABatchProcessor::bisect(std::vector<ReduceResult>& results,
                               std::vector<size_t> indices,
                               uint32_t depth,
                               std::chrono::steady_clock::time_point reduce_start)
{
    if (indices.size() == 1) {
        auto& rr = results[indices[0]];
        double queue_ms =
            std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - rr.enqueue_time).count();
        on_result_(VerifyResult{
            .request_id = rr.request_id,
            .verified = false,
            .status = static_cast<uint8_t>(VerifyStatus::FAILED),
            .error_message = "batch check failed (bisected to individual)",
            .source = rr.source,
            .time_in_queue_ms = queue_ms,
            .time_in_verify_ms = rr.reduce_ms,
            .time_in_sumcheck_ms = rr.reduce_ms,
            .batch_failure_count = depth + 1,
        });
        return;
    }

    info("IPABatchProcessor: bisecting ", indices.size(), " proofs at depth ", depth);

    size_t mid = indices.size() / 2;
    std::vector<size_t> left(indices.begin(), indices.begin() + static_cast<ptrdiff_t>(mid));
    std::vector<size_t> right(indices.begin() + static_cast<ptrdiff_t>(mid), indices.end());

    set_parallel_for_concurrency(num_cores_);

    auto left_start = std::chrono::steady_clock::now();
    bool left_ok = batch_check(results, left);
    auto left_end = std::chrono::steady_clock::now();
    double left_ms = std::chrono::duration<double, std::milli>(left_end - left_start).count();

    auto right_start = std::chrono::steady_clock::now();
    bool right_ok = batch_check(results, right);
    auto right_end = std::chrono::steady_clock::now();
    double right_ms = std::chrono::duration<double, std::milli>(right_end - right_start).count();

    if (left_ok) {
        emit_ok(results, left, reduce_start, left_ms, depth + 1);
    } else {
        bisect(results, std::move(left), depth + 1, reduce_start);
    }

    if (right_ok) {
        emit_ok(results, right, reduce_start, right_ms, depth + 1);
    } else {
        bisect(results, std::move(right), depth + 1, reduce_start);
    }
}

void IPABatchProcessor::emit_ok(const std::vector<ReduceResult>& results,
                                const std::vector<size_t>& indices,
                                std::chrono::steady_clock::time_point reduce_start,
                                double ipa_ms,
                                uint32_t depth)
{
    std::lock_guard lock(mutex_);
    for (size_t idx : indices) {
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
                .batch_failure_count = depth,
            });
        }
    }
}

} // namespace bb
#endif
