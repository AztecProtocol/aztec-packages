#ifndef __wasm__
#include "batch_turn_processor.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"

namespace bb {

void BatchTurnProcessor::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
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

    turn_thread_ = std::thread([this]() { turn_loop(); });
    info("BatchTurnProcessor started with ", num_cores_, " cores, batch_size=", batch_size_);
}

void BatchTurnProcessor::enqueue(VerifyRequest request)
{
    {
        std::lock_guard lock(mutex_);
        request.enqueue_time = std::chrono::steady_clock::now();
        incoming_.push_back(std::move(request));
    }
    cv_.notify_one();
}

bool BatchTurnProcessor::cancel(uint64_t request_id)
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

    // Check pending batches
    for (auto& batch : pending_batches_) {
        for (auto it = batch.requests.begin(); it != batch.requests.end(); ++it) {
            if (it->request_id == request_id) {
                on_result_(VerifyResult{
                    .request_id = request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                    .source = it->source,
                });
                batch.requests.erase(it);
                return true;
            }
        }
    }

    // Mark for in-flight cancellation
    cancelled_ids_.insert(request_id);
    return false;
}

uint32_t BatchTurnProcessor::cancel_by_source(const std::string& source)
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

    for (auto& batch : pending_batches_) {
        cancel_from(batch.requests);
    }

    return count;
}

void BatchTurnProcessor::stop()
{
    {
        std::lock_guard lock(mutex_);
        flush_requested_ = true;
        shutdown_ = true;
    }
    cv_.notify_one();

    if (turn_thread_.joinable()) {
        turn_thread_.join();
    }

    info("BatchTurnProcessor stopped");
}

BatchTurnProcessor::~BatchTurnProcessor()
{
    if (!shutdown_) {
        stop();
    }
}

void BatchTurnProcessor::turn_loop()
{
    while (true) {
        // 1. Wait for work and drain queues
        std::vector<Batch> batches_to_verify;
        {
            std::unique_lock lock(mutex_);
            cv_.wait(lock, [this] {
                if (shutdown_) {
                    return true;
                }
                // Wake if we have pending bisection work or enough incoming to form a batch
                return !pending_batches_.empty() || (accumulator_.size() + incoming_.size() >= batch_size_);
            });

            // Drain incoming into accumulator, forming batches when full
            while (!incoming_.empty()) {
                accumulator_.push_back(std::move(incoming_.front()));
                incoming_.pop_front();

                if (accumulator_.size() >= batch_size_) {
                    batches_to_verify.push_back(Batch{ .requests = std::move(accumulator_) });
                    accumulator_.clear();
                    accumulator_.reserve(batch_size_);
                }
            }

            // On shutdown, flush partial accumulator as a final batch
            if (flush_requested_ && !accumulator_.empty()) {
                batches_to_verify.push_back(Batch{ .requests = std::move(accumulator_) });
                accumulator_.clear();
            }

            // Grab pending bisection batches
            while (!pending_batches_.empty()) {
                batches_to_verify.push_back(std::move(pending_batches_.front()));
                pending_batches_.pop_front();
            }

            if (batches_to_verify.empty()) {
                if (shutdown_) {
                    break;
                }
                continue;
            }
        }

        // 2. Filter cancelled and invalid-VK requests from each batch before verification
        for (auto& batch : batches_to_verify) {
            auto it = batch.requests.begin();
            while (it != batch.requests.end()) {
                bool should_remove = false;

                // Check cancellation
                {
                    std::lock_guard lock(mutex_);
                    if (cancelled_ids_.count(it->request_id)) {
                        cancelled_ids_.erase(it->request_id);
                        on_result_(VerifyResult{
                            .request_id = it->request_id,
                            .verified = false,
                            .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                            .source = it->source,
                        });
                        should_remove = true;
                    }
                }

                // Check VK index validity
                if (!should_remove && it->vk_index >= vks_.size()) {
                    on_result_(VerifyResult{
                        .request_id = it->request_id,
                        .verified = false,
                        .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                        .error_message = "invalid vk_index: " + std::to_string(it->vk_index),
                        .source = it->source,
                    });
                    should_remove = true;
                }

                if (should_remove) {
                    it = batch.requests.erase(it);
                } else {
                    ++it;
                }
            }
        }

        // Remove empty batches
        std::erase_if(batches_to_verify, [](const Batch& b) { return b.requests.empty(); });
        if (batches_to_verify.empty()) {
            if (shutdown_) {
                std::lock_guard lock(mutex_);
                if (pending_batches_.empty() && incoming_.empty() && accumulator_.empty()) {
                    break;
                }
            }
            continue;
        }

        // 3. Determine parallelism: at most num_cores_ batches in parallel
        size_t num_batches = batches_to_verify.size();
        size_t max_parallel = std::min(num_batches, static_cast<size_t>(num_cores_));
        size_t cores_per_batch = std::max(size_t{ 1 }, static_cast<size_t>(num_cores_) / max_parallel);

        // 4. Verify batches in parallel (in waves if more batches than cores)
        struct BatchTiming {
            bool passed = false;
            std::chrono::steady_clock::time_point start;
            std::chrono::steady_clock::time_point end;
        };
        std::vector<BatchTiming> timings(num_batches);

        for (size_t wave_start = 0; wave_start < num_batches; wave_start += max_parallel) {
            size_t wave_end = std::min(wave_start + max_parallel, num_batches);
            std::vector<std::thread> wave_threads;

            for (size_t i = wave_start; i < wave_end; ++i) {
                wave_threads.emplace_back([&, i] {
                    set_parallel_for_concurrency(cores_per_batch);
                    timings[i].start = std::chrono::steady_clock::now();

                    // Build inputs for ChonkBatchVerifier
                    std::vector<ChonkBatchVerifier::Input> inputs;
                    inputs.reserve(batches_to_verify[i].requests.size());
                    for (const auto& req : batches_to_verify[i].requests) {
                        inputs.push_back({ .proof = req.proof, .vk_and_hash = vks_[req.vk_index] });
                    }
                    timings[i].passed = inputs.empty() || ChonkBatchVerifier::verify(inputs);
                    timings[i].end = std::chrono::steady_clock::now();
                });
            }
            for (auto& t : wave_threads) {
                t.join();
            }
        }

        // 5. Process results
        std::vector<Batch> new_pending;

        for (size_t i = 0; i < num_batches; ++i) {
            auto& batch = batches_to_verify[i];
            auto& timing = timings[i];
            double verify_ms = std::chrono::duration<double, std::milli>(timing.end - timing.start).count();

            if (timing.passed) {
                // All proofs in batch verified — emit OK (check late cancellations)
                std::lock_guard lock(mutex_);
                for (auto& req : batch.requests) {
                    if (cancelled_ids_.count(req.request_id)) {
                        cancelled_ids_.erase(req.request_id);
                        on_result_(VerifyResult{
                            .request_id = req.request_id,
                            .verified = false,
                            .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                            .source = req.source,
                        });
                    } else {
                        on_result_(VerifyResult{
                            .request_id = req.request_id,
                            .verified = true,
                            .status = static_cast<uint8_t>(VerifyStatus::OK),
                            .source = req.source,
                            .time_in_queue_ms =
                                std::chrono::duration<double, std::milli>(timing.start - req.enqueue_time).count(),
                            .time_in_verify_ms = verify_ms,
                            .batch_failure_count = batch.bisection_depth,
                        });
                    }
                }
            } else if (batch.requests.size() == 1) {
                // Single proof — definitely bad
                auto& req = batch.requests[0];
                on_result_(VerifyResult{
                    .request_id = req.request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                    .error_message = "proof failed verification (bisected to individual)",
                    .source = req.source,
                    .time_in_queue_ms =
                        std::chrono::duration<double, std::milli>(timing.start - req.enqueue_time).count(),
                    .time_in_verify_ms = verify_ms,
                    .batch_failure_count = batch.bisection_depth,
                });
            } else {
                // Batch failed — split in half and re-queue for next turn
                size_t mid = batch.requests.size() / 2;
                info("BatchTurnProcessor: batch of ",
                     batch.requests.size(),
                     " failed at depth ",
                     batch.bisection_depth,
                     ", bisecting");

                Batch left{
                    .requests = std::vector<VerifyRequest>(
                        std::make_move_iterator(batch.requests.begin()),
                        std::make_move_iterator(batch.requests.begin() + static_cast<ptrdiff_t>(mid))),
                    .bisection_depth = batch.bisection_depth + 1,
                };
                Batch right{
                    .requests = std::vector<VerifyRequest>(
                        std::make_move_iterator(batch.requests.begin() + static_cast<ptrdiff_t>(mid)),
                        std::make_move_iterator(batch.requests.end())),
                    .bisection_depth = batch.bisection_depth + 1,
                };
                new_pending.push_back(std::move(left));
                new_pending.push_back(std::move(right));
            }
        }

        // Push bisection halves for next turn
        if (!new_pending.empty()) {
            std::lock_guard lock(mutex_);
            for (auto& b : new_pending) {
                pending_batches_.push_back(std::move(b));
            }
        }

        // If shutdown and no remaining work, we're done
        if (shutdown_) {
            std::lock_guard lock(mutex_);
            if (pending_batches_.empty() && incoming_.empty() && accumulator_.empty()) {
                break;
            }
            // Otherwise continue processing bisection work
        }
    }
}

} // namespace bb
#endif
