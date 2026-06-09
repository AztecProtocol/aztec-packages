#ifndef __wasm__
#include "chonk_batch_verifier.hpp"
#include "barretenberg/chonk/chonk_verifier.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"

namespace bb {

void ChonkBatchVerifier::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                               uint32_t num_cores,
                               uint32_t batch_size,
                               ResultCallback on_result)
{
    {
        std::lock_guard lock(mutex_);
        if (running_ || stopping_) {
            throw_or_abort("ChonkBatchVerifier: already started");
        }
        vks_ = std::move(vks);
        num_cores_ = std::max(1u, num_cores);
        batch_size_ = std::max(1u, batch_size);
        on_result_ = std::move(on_result);
        queue_.clear();
        in_flight_ids_.clear();
        shutdown_ = false;
        running_ = true;
    }

    coordinator_thread_ = std::thread([this]() { coordinator_loop(); });
    info("ChonkBatchVerifier started with ", num_cores_, " cores, batch_size=", batch_size_);
}

void ChonkBatchVerifier::enqueue(VerifyRequest request)
{
    VerifyResult failure;
    bool has_failure = false;
    {
        std::lock_guard lock(mutex_);
        if (!running_ || shutdown_) {
            throw_or_abort("ChonkBatchVerifier: enqueue called while verifier is not running");
        }
        if (in_flight_ids_.contains(request.request_id)) {
            throw_or_abort("ChonkBatchVerifier: duplicate request_id: " + std::to_string(request.request_id));
        }
        if (queue_.size() >= MAX_QUEUE_SIZE) {
            throw_or_abort("ChonkBatchVerifier: queue is full");
        }

        request.enqueue_time = std::chrono::steady_clock::now();
        in_flight_ids_.insert(request.request_id);

        if (request.vk_index >= vks_.size()) {
            failure = VerifyResult::failed(request.request_id, "invalid vk_index: " + std::to_string(request.vk_index));
            has_failure = true;
        } else if (vks_[request.vk_index] == nullptr || vks_[request.vk_index]->vk == nullptr) {
            failure = VerifyResult::failed(request.request_id, "missing verification key");
            has_failure = true;
        } else {
            const size_t expected_proof_size = static_cast<size_t>(vks_[request.vk_index]->vk->num_public_inputs) +
                                               ChonkProof::PROOF_LENGTH_WITHOUT_PUB_INPUTS;
            if (request.proof.size() != expected_proof_size) {
                failure = VerifyResult::failed(request.request_id,
                                               "proof has wrong size: expected " + std::to_string(expected_proof_size) +
                                                   ", got " + std::to_string(request.proof.size()));
                has_failure = true;
            } else {
                queue_.push_back(std::move(request));
            }
        }
    }
    if (has_failure) {
        dispatch(std::move(failure));
    } else {
        cv_.notify_one();
    }
}

void ChonkBatchVerifier::stop()
{
    std::thread coordinator_thread;
    {
        std::unique_lock lock(mutex_);
        if (stopping_) {
            stopped_cv_.wait(lock, [this] { return !stopping_; });
            return;
        }
        if (!running_ && !coordinator_thread_.joinable()) {
            return;
        }
        stopping_ = true;
        shutdown_ = true;
        if (coordinator_thread_.joinable()) {
            coordinator_thread = std::move(coordinator_thread_);
        }
    }
    cv_.notify_one();
    if (coordinator_thread.joinable()) {
        coordinator_thread.join();
    }
    {
        std::lock_guard lock(mutex_);
        running_ = false;
        queue_.clear();
        in_flight_ids_.clear();
        stopping_ = false;
    }
    stopped_cv_.notify_all();
    info("ChonkBatchVerifier stopped");
}

ChonkBatchVerifier::~ChonkBatchVerifier()
{
    bool should_stop = false;
    {
        std::lock_guard lock(mutex_);
        should_stop = running_ || coordinator_thread_.joinable() || stopping_;
    }
    if (should_stop) {
        stop();
    }
}

void ChonkBatchVerifier::dispatch(VerifyResult result)
{
    const uint64_t request_id = result.request_id;
    try {
        // Result delivery owns the request id until the callback completes.
        if (on_result_) {
            on_result_(std::move(result));
        }
    } catch (const std::exception& e) {
        info("ChonkBatchVerifier: result callback threw: ", e.what());
    } catch (...) {
        info("ChonkBatchVerifier: result callback threw unknown exception");
    }
    std::lock_guard lock(mutex_);
    in_flight_ids_.erase(request_id);
}

void ChonkBatchVerifier::coordinator_loop()
{
    while (true) {
        // ── Collect a batch ──────────────────────────────────────────────
        std::vector<VerifyRequest> batch;
        {
            std::unique_lock lock(mutex_);

            // Wait until we have work or are told to shut down.
            // No timeout needed: while we're processing a batch, new proofs
            // accumulate in the queue. When idle, process whatever arrives immediately.
            cv_.wait(lock, [this] { return shutdown_ || !queue_.empty(); });

            // Take up to batch_size_ items (may be a partial batch)
            size_t take = std::min(queue_.size(), static_cast<size_t>(batch_size_));
            if (take > 0) {
                auto end = queue_.begin() + static_cast<ptrdiff_t>(take);
                batch.assign(std::make_move_iterator(queue_.begin()), std::make_move_iterator(end));
                queue_.erase(queue_.begin(), end);
            }

            if (batch.empty()) {
                if (shutdown_) {
                    break;
                }
                continue;
            }

            // Invalid VK indices and malformed proof sizes are rejected at enqueue time.
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
                dispatch(std::move(result));
            } else {
                passed_indices.push_back(i);
            }
        }

        if (passed_indices.empty()) {
            continue;
        }

        // ── Phase 2: batch IPA verification ────────────────────────────
        auto ipa_start = std::chrono::steady_clock::now();
        bool ok = batch_check(reduce_results, passed_indices);
        double ipa_ms = ms_since(ipa_start);
        double reduce_ms = ms_between(reduce_start, ipa_start);

        info("ChonkBatchVerifier: batch of ",
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

std::vector<ChonkBatchVerifier::ReduceResult> ChonkBatchVerifier::parallel_reduce(
    const std::vector<VerifyRequest>& batch)
{
    const size_t num_proofs = batch.size();
    std::vector<ReduceResult> results(num_proofs);
    std::atomic<size_t> work_index{ 0 };

    uint32_t num_workers = std::min(num_cores_, static_cast<uint32_t>(num_proofs));
    std::vector<std::thread> workers;
    workers.reserve(num_workers);

    for (uint32_t w = 0; w < num_workers; ++w) {
        workers.emplace_back([&]() {
            // Each worker thread is single-threaded for reduce_to_ipa_claim
            set_parallel_for_concurrency(1);
            while (true) {
                size_t idx = work_index.fetch_add(1, std::memory_order_relaxed);
                if (idx >= num_proofs) {
                    break;
                }
                auto& req = batch[idx];
                auto t0 = std::chrono::steady_clock::now();

                try {
                    ChonkNativeVerifier verifier(vks_[req.vk_index]);
                    auto reduced = verifier.reduce_to_ipa_claim(req.proof);

                    results[idx] = ReduceResult{
                        .request_id = req.request_id,
                        .ipa_claim = std::move(reduced.ipa_claim),
                        .ipa_proof = std::move(reduced.ipa_proof),
                        .all_checks_passed = reduced.all_checks_passed,
                        .error_message = reduced.all_checks_passed ? "" : "reduction failed",
                        .enqueue_time = req.enqueue_time,
                        .reduce_ms = ms_since(t0),
                    };
                } catch (const std::exception& e) {
                    results[idx] = ReduceResult{
                        .request_id = req.request_id,
                        .ipa_claim = {},
                        .ipa_proof = {},
                        .all_checks_passed = false,
                        .error_message = std::string("reduce_to_ipa_claim threw: ") + e.what(),
                        .enqueue_time = req.enqueue_time,
                        .reduce_ms = ms_since(t0),
                    };
                } catch (...) {
                    results[idx] = ReduceResult{
                        .request_id = req.request_id,
                        .ipa_claim = {},
                        .ipa_proof = {},
                        .all_checks_passed = false,
                        .error_message = "reduce_to_ipa_claim threw unknown exception",
                        .enqueue_time = req.enqueue_time,
                        .reduce_ms = ms_since(t0),
                    };
                }
            }
        });
    }
    for (auto& t : workers) {
        t.join();
    }

    return results;
}

bool ChonkBatchVerifier::batch_check(const std::vector<ReduceResult>& results, const std::vector<size_t>& indices)
{
    if (indices.empty()) {
        return true;
    }

    set_parallel_for_concurrency(num_cores_);

    try {
        // Collect IPA claims and transcripts for batch verification
        std::vector<OpeningClaim<curve::Grumpkin>> claims;
        std::vector<std::shared_ptr<NativeTranscript>> transcripts;
        claims.reserve(indices.size());
        transcripts.reserve(indices.size());
        for (size_t idx : indices) {
            claims.push_back(results[idx].ipa_claim);
            transcripts.push_back(std::make_shared<NativeTranscript>(results[idx].ipa_proof));
        }

        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        return IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, claims, transcripts);
    } catch (const std::exception& e) {
        info("ChonkBatchVerifier: batch_check exception: ", e.what());
        return false;
    }
}

void ChonkBatchVerifier::bisect(std::vector<ReduceResult>& results,
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
        dispatch(std::move(result));
        return;
    }

    info("ChonkBatchVerifier: bisecting ", indices.size(), " proofs at depth ", depth);

    size_t mid = indices.size() / 2;
    std::vector<size_t> left(indices.begin(), indices.begin() + static_cast<ptrdiff_t>(mid));
    std::vector<size_t> right(indices.begin() + static_cast<ptrdiff_t>(mid), indices.end());

    // Check left half; if it passes, all failures must be in the right half (skip redundant check)
    auto t0 = std::chrono::steady_clock::now();
    bool left_ok = batch_check(results, left);
    double left_ms = ms_since(t0);

    if (left_ok) {
        emit_ok(results, left, reduce_start, left_ms, depth + 1);
        // All failures are in the right half — recurse directly without re-checking
        bisect(results, std::move(right), depth + 1, reduce_start);
    } else {
        // Left failed — need to check right independently
        bisect(results, std::move(left), depth + 1, reduce_start);

        auto t1 = std::chrono::steady_clock::now();
        bool right_ok = batch_check(results, right);
        double right_ms = ms_since(t1);

        if (right_ok) {
            emit_ok(results, right, reduce_start, right_ms, depth + 1);
        } else {
            bisect(results, std::move(right), depth + 1, reduce_start);
        }
    }
}

void ChonkBatchVerifier::emit_ok(const std::vector<ReduceResult>& results,
                                 const std::vector<size_t>& indices,
                                 std::chrono::steady_clock::time_point reduce_start,
                                 double ipa_ms,
                                 uint32_t depth)
{
    for (size_t idx : indices) {
        auto& rr = results[idx];
        dispatch(VerifyResult{
            .request_id = rr.request_id,
            .status = static_cast<uint8_t>(VerifyStatus::OK),
            .error_message = "",
            .time_in_queue_ms = ms_between(rr.enqueue_time, reduce_start),
            .time_in_verify_ms = rr.reduce_ms + ipa_ms,
            .batch_failure_count = depth,
        });
    }
}

} // namespace bb
#endif
