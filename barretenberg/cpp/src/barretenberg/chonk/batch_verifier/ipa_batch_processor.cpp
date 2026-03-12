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

    coordinator_thread_ = std::thread([this]() { coordinator_loop(); });
    info("IPABatchProcessor started with ", num_cores_, " cores, batch_size=", batch_size_);
}

void IPABatchProcessor::enqueue(VerifyRequest request)
{
    {
        std::lock_guard lock(mutex_);
        request.enqueue_time = std::chrono::steady_clock::now();
        queue_.push_back(std::move(request));
    }
    cv_.notify_one();
}

void IPABatchProcessor::stop()
{
    {
        std::lock_guard lock(mutex_);
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
        // ── Collect a batch ──────────────────────────────────────────────
        std::vector<VerifyRequest> batch;
        {
            std::unique_lock lock(mutex_);
            cv_.wait(lock, [this] { return shutdown_ || queue_.size() >= batch_size_; });

            if (queue_.size() >= batch_size_) {
                // Take exactly batch_size_ items
                auto end = queue_.begin() + static_cast<ptrdiff_t>(batch_size_);
                batch.assign(std::make_move_iterator(queue_.begin()), std::make_move_iterator(end));
                queue_.erase(queue_.begin(), end);
            } else if (shutdown_ && !queue_.empty()) {
                // Flush remaining on shutdown
                batch.assign(std::make_move_iterator(queue_.begin()), std::make_move_iterator(queue_.end()));
                queue_.clear();
            }

            if (batch.empty()) {
                if (shutdown_) {
                    break;
                }
                continue;
            }

            // Filter invalid-VK requests before releasing the lock
            auto it = batch.begin();
            while (it != batch.end()) {
                if (it->vk_index >= vks_.size()) {
                    on_result_(
                        VerifyResult::failed(it->request_id, "invalid vk_index: " + std::to_string(it->vk_index)));
                    it = batch.erase(it);
                } else {
                    ++it;
                }
            }
        }

        if (batch.empty()) {
            continue;
        }

        // ── Phase 1: parallel reduce (all cores, work-stealing) ──────────
        auto reduce_start = std::chrono::steady_clock::now();
        auto reduce_results = parallel_reduce(batch);

        // Separate passed from failed (emit failures immediately)
        std::vector<size_t> passed_indices;
        passed_indices.reserve(reduce_results.size());
        for (size_t i = 0; i < reduce_results.size(); ++i) {
            auto& rr = reduce_results[i];
            if (!rr.all_checks_passed) {
                auto result = VerifyResult::failed(rr.request_id, rr.error_message);
                result.time_in_queue_ms = ms_between(rr.enqueue_time, reduce_start);
                result.time_in_verify_ms = rr.reduce_ms;
                on_result_(std::move(result));
            } else {
                passed_indices.push_back(i);
            }
        }

        if (passed_indices.empty()) {
            continue;
        }

        // ── Phase 2: unified batch check (pairing + IPA) ────────────────
        set_parallel_for_concurrency(num_cores_);

        auto ipa_start = std::chrono::steady_clock::now();
        bool ok = batch_check(reduce_results, passed_indices);
        double ipa_ms = ms_since(ipa_start);
        double reduce_ms = ms_between(reduce_start, ipa_start);

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
    }
}

std::vector<IPABatchProcessor::ReduceResult> IPABatchProcessor::parallel_reduce(const std::vector<VerifyRequest>& batch)
{
    const size_t num_proofs = batch.size();
    std::vector<ReduceResult> results(num_proofs);
    std::atomic<size_t> work_index{ 0 };

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
                auto reduced = verifier.reduce_to_batch_ipa_claim(req.proof);
                results[idx] = ReduceResult{
                    .request_id = req.request_id,
                    .deferred_ipa_claim = std::move(reduced.deferred_ipa_claim),
                    .ipa_proof = std::move(reduced.ipa_proof),
                    .mega_pcs_pairing_points = std::move(reduced.mega_pcs_pairing_points),
                    .merge_pairing_points = std::move(reduced.merge_pairing_points),
                    .translator_pairing_points = std::move(reduced.translator_pairing_points),
                    .all_checks_passed = reduced.all_checks_passed,
                    .error_message = reduced.all_checks_passed ? "" : "reduction failed",
                    .enqueue_time = req.enqueue_time,
                    .reduce_ms = ms_since(t0),
                };
            }
        });
    }
    for (auto& t : workers) {
        t.join();
    }

    return results;
}

bool IPABatchProcessor::batch_check(const std::vector<ReduceResult>& results, const std::vector<size_t>& indices)
{
    if (indices.empty()) {
        return true;
    }

    // Aggregate and check all pairing points
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

    // Batch IPA verify
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
    // Base case: single proof identified as the failure
    if (indices.size() == 1) {
        auto& rr = results[indices[0]];
        auto result = VerifyResult::failed(rr.request_id, "batch check failed (bisected to individual)");
        result.time_in_queue_ms = ms_between(rr.enqueue_time, std::chrono::steady_clock::now());
        result.time_in_verify_ms = rr.reduce_ms;
        result.batch_failure_count = depth + 1;
        on_result_(std::move(result));
        return;
    }

    info("IPABatchProcessor: bisecting ", indices.size(), " proofs at depth ", depth);

    size_t mid = indices.size() / 2;
    std::vector<size_t> left(indices.begin(), indices.begin() + static_cast<ptrdiff_t>(mid));
    std::vector<size_t> right(indices.begin() + static_cast<ptrdiff_t>(mid), indices.end());

    // Check each half and recurse on failures
    auto check_half = [&](std::vector<size_t> half) {
        set_parallel_for_concurrency(num_cores_);
        auto t0 = std::chrono::steady_clock::now();
        bool ok = batch_check(results, half);
        double check_ms = ms_since(t0);

        if (ok) {
            emit_ok(results, half, reduce_start, check_ms, depth + 1);
        } else {
            bisect(results, std::move(half), depth + 1, reduce_start);
        }
    };

    check_half(std::move(left));
    check_half(std::move(right));
}

void IPABatchProcessor::emit_ok(const std::vector<ReduceResult>& results,
                                const std::vector<size_t>& indices,
                                std::chrono::steady_clock::time_point reduce_start,
                                double ipa_ms,
                                uint32_t depth)
{
    for (size_t idx : indices) {
        auto& rr = results[idx];
        on_result_(VerifyResult{
            .request_id = rr.request_id,
            .status = static_cast<uint8_t>(VerifyStatus::OK),
            .time_in_queue_ms = ms_between(rr.enqueue_time, reduce_start),
            .time_in_verify_ms = rr.reduce_ms + ipa_ms,
            .batch_failure_count = depth,
        });
    }
}

} // namespace bb
#endif
