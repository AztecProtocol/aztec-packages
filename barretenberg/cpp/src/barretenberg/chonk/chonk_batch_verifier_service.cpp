#ifndef __wasm__
#include "chonk_batch_verifier_service.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

namespace bb {

void ChonkBatchVerifierService::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                                      const std::string& output_fifo_path,
                                      const BatchVerifierConfig& config)
{
    config_ = config;
    vks_ = std::move(vks);
    shutdown_ = false;

    // Create the FIFO if it doesn't exist
    mkfifo(output_fifo_path.c_str(), 0600);

    // Open FIFO for writing (will block until reader connects)
    output_fd_ = open(output_fifo_path.c_str(), O_WRONLY);
    if (output_fd_ < 0) {
        throw_or_abort("ChonkBatchVerifierService: failed to open output FIFO: " + output_fifo_path);
    }

    // Start writer thread
    writer_thread_ = std::thread([this]() { writer_loop(); });

    info("ChonkBatchVerifierService started with ",
         config_.num_threads,
         " threads, trusted_batch_size=",
         config_.trusted_batch_size);
}

bool ChonkBatchVerifierService::queue(VerifyRequest request)
{
    std::lock_guard lock(mutex_);

    request.enqueue_time = std::chrono::steady_clock::now();

    if (request.trusted) {
        trusted_buffer_.push_back(std::move(request));

        // Flush if batch is full
        if (trusted_buffer_.size() >= config_.trusted_batch_size) {
            flush_trusted_batch();
        }
    } else {
        // Untrusted: dispatch immediately on a new thread
        inflight_count_++;
        workers_.emplace_back([this, r = std::move(request)]() mutable { verify_untrusted(std::move(r)); });
    }

    return true;
}

bool ChonkBatchVerifierService::cancel(uint64_t request_id)
{
    std::lock_guard lock(mutex_);

    // Check trusted buffer first
    for (auto it = trusted_buffer_.begin(); it != trusted_buffer_.end(); ++it) {
        if (it->request_id == request_id) {
            emit_result(VerifyResult{
                .request_id = request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = it->source,
            });
            trusted_buffer_.erase(it);
            return true;
        }
    }

    // Mark for cancellation (in-flight work will check this)
    cancelled_ids_.insert(request_id);
    return true;
}

uint32_t ChonkBatchVerifierService::cancel_by_source(const std::string& source)
{
    std::lock_guard lock(mutex_);
    uint32_t count = 0;

    // Cancel from trusted buffer
    auto it = trusted_buffer_.begin();
    while (it != trusted_buffer_.end()) {
        if (it->source == source) {
            emit_result(VerifyResult{
                .request_id = it->request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = source,
            });
            it = trusted_buffer_.erase(it);
            count++;
        } else {
            ++it;
        }
    }

    return count;
}

void ChonkBatchVerifierService::stop()
{
    // Flush any remaining trusted proofs
    {
        std::lock_guard lock(mutex_);
        if (!trusted_buffer_.empty()) {
            flush_trusted_batch();
        }
    }

    // Wait for all in-flight work to complete
    while (inflight_count_ > 0) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    // Signal shutdown
    shutdown_ = true;
    result_cv_.notify_all();

    // Join all worker threads
    for (auto& t : workers_) {
        if (t.joinable()) {
            t.join();
        }
    }
    workers_.clear();

    // Join writer thread
    if (writer_thread_.joinable()) {
        writer_thread_.join();
    }

    // Close FIFO
    if (output_fd_ >= 0) {
        close(output_fd_);
        output_fd_ = -1;
    }

    info("ChonkBatchVerifierService stopped");
}

ChonkBatchVerifierService::~ChonkBatchVerifierService()
{
    if (!shutdown_) {
        stop();
    }
}

void ChonkBatchVerifierService::flush_trusted_batch()
{
    // Called with mutex_ held
    if (trusted_buffer_.empty()) {
        return;
    }

    // Filter cancelled requests
    std::vector<VerifyRequest> batch;
    batch.reserve(trusted_buffer_.size());

    for (auto& req : trusted_buffer_) {
        if (cancelled_ids_.count(req.request_id)) {
            cancelled_ids_.erase(req.request_id);
            emit_result(VerifyResult{
                .request_id = req.request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = req.source,
            });
        } else {
            batch.push_back(std::move(req));
        }
    }
    trusted_buffer_.clear();

    if (batch.empty()) {
        return;
    }

    inflight_count_++;
    workers_.emplace_back([this, b = std::move(batch)]() mutable { verify_trusted_batch(std::move(b)); });
}

void ChonkBatchVerifierService::verify_trusted_batch(std::vector<VerifyRequest> batch)
{
    // Set thread-local concurrency for nested parallel_for
    const size_t total_cpus = get_num_cpus();
    const size_t threads_per_task = std::min(total_cpus, std::max(size_t{ 2 }, total_cpus / 2));
    set_parallel_for_concurrency(threads_per_task);

    auto batch_start = std::chrono::steady_clock::now();

    // Phase 1: reduce each proof to IPA claim (non-IPA verification)
    std::vector<OpeningClaim<curve::Grumpkin>> ipa_claims;
    std::vector<std::shared_ptr<NativeTranscript>> ipa_transcripts;
    std::vector<size_t> valid_indices; // Maps claim index back to batch index
    ipa_claims.reserve(batch.size());
    ipa_transcripts.reserve(batch.size());
    valid_indices.reserve(batch.size());

    for (size_t i = 0; i < batch.size(); ++i) {
        auto& req = batch[i];

        if (req.vk_index >= vks_.size()) {
            emit_result(VerifyResult{
                .request_id = req.request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                .error_message = "invalid vk_index: " + std::to_string(req.vk_index),
                .source = req.source,
            });
            continue;
        }

        ChonkNativeVerifier verifier(vks_[req.vk_index]);
        auto result = verifier.reduce_to_ipa_claim(req.proof);

        if (!result.all_checks_passed) {
            auto now = std::chrono::steady_clock::now();
            emit_result(VerifyResult{
                .request_id = req.request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                .error_message = "non-IPA verification failed",
                .source = req.source,
                .time_in_queue_ms = std::chrono::duration<double, std::milli>(batch_start - req.enqueue_time).count(),
                .time_in_sumcheck_ms = std::chrono::duration<double, std::milli>(now - batch_start).count(),
            });
            continue;
        }

        ipa_claims.push_back(result.ipa_claim);
        ipa_transcripts.push_back(std::make_shared<NativeTranscript>(result.ipa_proof));
        valid_indices.push_back(i);
    }

    if (ipa_claims.empty()) {
        inflight_count_--;
        return;
    }

    // Phase 2: batch IPA verification
    auto ipa_start = std::chrono::steady_clock::now();
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    bool ipa_passed = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, ipa_claims, ipa_transcripts);
    auto ipa_end = std::chrono::steady_clock::now();
    double ipa_ms = std::chrono::duration<double, std::milli>(ipa_end - ipa_start).count();
    double sumcheck_ms = std::chrono::duration<double, std::milli>(ipa_start - batch_start).count();

    if (ipa_passed) {
        // All proofs verified — emit OK for each (check late cancellations)
        std::lock_guard lock(mutex_);
        for (size_t idx : valid_indices) {
            auto& req = batch[idx];
            if (cancelled_ids_.count(req.request_id)) {
                cancelled_ids_.erase(req.request_id);
                emit_result(VerifyResult{
                    .request_id = req.request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                    .source = req.source,
                });
            } else {
                emit_result(VerifyResult{
                    .request_id = req.request_id,
                    .verified = true,
                    .status = static_cast<uint8_t>(VerifyStatus::OK),
                    .source = req.source,
                    .time_in_queue_ms =
                        std::chrono::duration<double, std::milli>(batch_start - req.enqueue_time).count(),
                    .time_in_sumcheck_ms = sumcheck_ms,
                    .time_in_ipa_ms = ipa_ms,
                });
            }
        }
    } else {
        // IPA batch failed — bisect to find bad proofs
        info("ChonkBatchVerifierService: trusted batch of ", valid_indices.size(), " failed IPA, bisecting");

        // Collect only the valid requests for bisection
        std::vector<VerifyRequest> to_bisect;
        to_bisect.reserve(valid_indices.size());
        for (size_t idx : valid_indices) {
            to_bisect.push_back(std::move(batch[idx]));
        }
        bisect(std::move(to_bisect), 1);
    }

    inflight_count_--;
}

void ChonkBatchVerifierService::bisect(std::vector<VerifyRequest> batch, uint32_t failure_depth)
{
    if (batch.size() == 1) {
        // Found the bad proof
        auto& req = batch[0];
        emit_result(VerifyResult{
            .request_id = req.request_id,
            .verified = false,
            .status = static_cast<uint8_t>(VerifyStatus::FAILED),
            .error_message = "proof failed batch verification (bisected)",
            .source = req.source,
            .time_in_queue_ms =
                std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - req.enqueue_time).count(),
            .batch_failure_count = failure_depth,
        });
        return;
    }

    size_t mid = batch.size() / 2;
    std::vector<VerifyRequest> left(std::make_move_iterator(batch.begin()),
                                    std::make_move_iterator(batch.begin() + static_cast<ptrdiff_t>(mid)));
    std::vector<VerifyRequest> right(std::make_move_iterator(batch.begin() + static_cast<ptrdiff_t>(mid)),
                                     std::make_move_iterator(batch.end()));

    auto verify_half = [this](const std::vector<VerifyRequest>& half) -> bool {
        std::vector<ChonkBatchVerifier::Input> inputs;
        inputs.reserve(half.size());
        for (const auto& req : half) {
            if (req.vk_index < vks_.size()) {
                inputs.push_back({ .proof = req.proof, .vk_and_hash = vks_[req.vk_index] });
            }
        }
        return inputs.empty() || ChonkBatchVerifier::verify(inputs);
    };

    bool left_ok = verify_half(left);
    bool right_ok = verify_half(right);

    auto resolve_ok = [this, &failure_depth](std::vector<VerifyRequest>& half) {
        for (auto& req : half) {
            emit_result(VerifyResult{
                .request_id = req.request_id,
                .verified = true,
                .status = static_cast<uint8_t>(VerifyStatus::OK),
                .source = req.source,
                .time_in_queue_ms =
                    std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - req.enqueue_time)
                        .count(),
                .batch_failure_count = failure_depth,
            });
        }
    };

    if (left_ok) {
        resolve_ok(left);
    } else {
        bisect(std::move(left), failure_depth + 1);
    }

    if (right_ok) {
        resolve_ok(right);
    } else {
        bisect(std::move(right), failure_depth + 1);
    }
}

void ChonkBatchVerifierService::verify_untrusted(VerifyRequest request)
{
    const size_t total_cpus = get_num_cpus();
    const size_t threads_per_task = std::min(total_cpus, std::max(size_t{ 2 }, total_cpus / 2));
    set_parallel_for_concurrency(threads_per_task);

    auto verify_start = std::chrono::steady_clock::now();
    double queue_ms = std::chrono::duration<double, std::milli>(verify_start - request.enqueue_time).count();

    // Check cancellation
    {
        std::lock_guard lock(mutex_);
        if (cancelled_ids_.count(request.request_id)) {
            cancelled_ids_.erase(request.request_id);
            emit_result(VerifyResult{
                .request_id = request.request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = request.source,
                .time_in_queue_ms = queue_ms,
            });
            inflight_count_--;
            return;
        }
    }

    if (request.vk_index >= vks_.size()) {
        emit_result(VerifyResult{
            .request_id = request.request_id,
            .verified = false,
            .status = static_cast<uint8_t>(VerifyStatus::FAILED),
            .error_message = "invalid vk_index: " + std::to_string(request.vk_index),
            .source = request.source,
            .time_in_queue_ms = queue_ms,
        });
        inflight_count_--;
        return;
    }

    // Phase 1: non-IPA verification
    ChonkNativeVerifier verifier(vks_[request.vk_index]);
    auto sumcheck_start = std::chrono::steady_clock::now();
    auto result = verifier.reduce_to_ipa_claim(request.proof);
    auto sumcheck_end = std::chrono::steady_clock::now();
    double sumcheck_ms = std::chrono::duration<double, std::milli>(sumcheck_end - sumcheck_start).count();

    if (!result.all_checks_passed) {
        emit_result(VerifyResult{
            .request_id = request.request_id,
            .verified = false,
            .status = static_cast<uint8_t>(VerifyStatus::FAILED),
            .error_message = "verification failed (untrusted)",
            .source = request.source,
            .time_in_queue_ms = queue_ms,
            .time_in_sumcheck_ms = sumcheck_ms,
        });
        inflight_count_--;
        return;
    }

    // Phase 2: IPA verification (single proof)
    auto ipa_start = std::chrono::steady_clock::now();
    auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
    std::vector<OpeningClaim<curve::Grumpkin>> claims = { result.ipa_claim };
    std::vector<std::shared_ptr<NativeTranscript>> transcripts = { std::make_shared<NativeTranscript>(
        result.ipa_proof) };
    bool ipa_ok = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, claims, transcripts);
    auto ipa_end = std::chrono::steady_clock::now();
    double ipa_ms = std::chrono::duration<double, std::milli>(ipa_end - ipa_start).count();

    emit_result(VerifyResult{
        .request_id = request.request_id,
        .verified = ipa_ok,
        .status = static_cast<uint8_t>(ipa_ok ? VerifyStatus::OK : VerifyStatus::FAILED),
        .error_message = ipa_ok ? "" : "IPA verification failed (untrusted)",
        .source = request.source,
        .time_in_queue_ms = queue_ms,
        .time_in_sumcheck_ms = sumcheck_ms,
        .time_in_ipa_ms = ipa_ms,
    });

    inflight_count_--;
}

void ChonkBatchVerifierService::emit_result(VerifyResult result)
{
    {
        std::lock_guard lock(result_mutex_);
        result_queue_.push_back(std::move(result));
    }
    result_cv_.notify_one();
}

void ChonkBatchVerifierService::writer_loop()
{
    while (true) {
        std::unique_lock lock(result_mutex_);
        result_cv_.wait(lock, [this]() { return !result_queue_.empty() || shutdown_; });

        if (shutdown_ && result_queue_.empty()) {
            break;
        }

        // Drain all available results
        std::deque<VerifyResult> to_write;
        std::swap(to_write, result_queue_);
        lock.unlock();

        for (auto& result : to_write) {
            // Encode as msgpack
            msgpack::sbuffer buffer;
            msgpack::pack(buffer, result);

            // Write size-delimited: [4-byte big-endian length][msgpack payload]
            uint32_t size = static_cast<uint32_t>(buffer.size());
            uint8_t size_buf[4] = {
                static_cast<uint8_t>((size >> 24) & 0xFF),
                static_cast<uint8_t>((size >> 16) & 0xFF),
                static_cast<uint8_t>((size >> 8) & 0xFF),
                static_cast<uint8_t>(size & 0xFF),
            };

            if (output_fd_ >= 0) {
                // Write size prefix then payload
                auto written = ::write(output_fd_, size_buf, 4);
                if (written == 4) {
                    ::write(output_fd_, buffer.data(), buffer.size());
                }
            }
        }
    }
}

} // namespace bb
#endif
