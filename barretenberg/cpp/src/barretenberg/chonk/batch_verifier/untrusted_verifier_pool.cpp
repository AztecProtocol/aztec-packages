#ifndef __wasm__
#include "untrusted_verifier_pool.hpp"
#include "barretenberg/commitment_schemes/ipa/ipa.hpp"
#include "barretenberg/commitment_schemes/verification_key.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/eccvm/eccvm_flavor.hpp"

namespace bb {

void UntrustedVerifierPool::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                                  uint32_t num_threads,
                                  ResultCallback on_result)
{
    vks_ = std::move(vks);
    on_result_ = std::move(on_result);
    shutdown_ = false;

    for (uint32_t i = 0; i < num_threads; ++i) {
        workers_.emplace_back([this]() { worker_loop(); });
    }

    info("UntrustedVerifierPool started with ", num_threads, " threads");
}

void UntrustedVerifierPool::enqueue(VerifyRequest request)
{
    {
        std::lock_guard lock(mutex_);
        request.enqueue_time = std::chrono::steady_clock::now();
        queue_.push_back(std::move(request));
    }
    cv_.notify_one();
}

bool UntrustedVerifierPool::cancel(uint64_t request_id)
{
    std::lock_guard lock(mutex_);

    // Check queue
    for (auto it = queue_.begin(); it != queue_.end(); ++it) {
        if (it->request_id == request_id) {
            on_result_(VerifyResult{
                .request_id = request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = it->source,
            });
            queue_.erase(it);
            return true;
        }
    }

    // Mark for in-flight cancellation
    cancelled_ids_.insert(request_id);
    return false;
}

uint32_t UntrustedVerifierPool::cancel_by_source(const std::string& source)
{
    std::lock_guard lock(mutex_);
    uint32_t count = 0;

    auto it = queue_.begin();
    while (it != queue_.end()) {
        if (it->source == source) {
            on_result_(VerifyResult{
                .request_id = it->request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                .source = source,
            });
            it = queue_.erase(it);
            count++;
        } else {
            ++it;
        }
    }

    return count;
}

void UntrustedVerifierPool::stop()
{
    {
        std::lock_guard lock(mutex_);
        shutdown_ = true;
    }
    cv_.notify_all();

    for (auto& t : workers_) {
        if (t.joinable()) {
            t.join();
        }
    }
    workers_.clear();

    info("UntrustedVerifierPool stopped");
}

UntrustedVerifierPool::~UntrustedVerifierPool()
{
    if (!shutdown_) {
        stop();
    }
}

void UntrustedVerifierPool::worker_loop()
{
    while (true) {
        VerifyRequest request;
        {
            std::unique_lock lock(mutex_);
            cv_.wait(lock, [this] { return !queue_.empty() || shutdown_; });
            if (shutdown_ && queue_.empty()) {
                return;
            }

            request = std::move(queue_.front());
            queue_.pop_front();

            // Check cancellation
            if (cancelled_ids_.count(request.request_id)) {
                cancelled_ids_.erase(request.request_id);
                on_result_(VerifyResult{
                    .request_id = request.request_id,
                    .verified = false,
                    .status = static_cast<uint8_t>(VerifyStatus::CANCELLED),
                    .source = request.source,
                });
                continue;
            }
        }

        // Each worker uses all available cores for its proof
        set_parallel_for_concurrency(get_num_cpus());

        auto verify_start = std::chrono::steady_clock::now();
        double queue_ms = std::chrono::duration<double, std::milli>(verify_start - request.enqueue_time).count();

        // Validate VK index
        if (request.vk_index >= vks_.size()) {
            on_result_(VerifyResult{
                .request_id = request.request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                .error_message = "invalid vk_index: " + std::to_string(request.vk_index),
                .source = request.source,
                .time_in_queue_ms = queue_ms,
            });
            continue;
        }

        // Full individual verification (reduce to IPA claim + IPA verify)
        ChonkNativeVerifier verifier(vks_[request.vk_index]);
        auto result = verifier.reduce_to_ipa_claim(request.proof);

        if (!result.all_checks_passed) {
            auto now = std::chrono::steady_clock::now();
            on_result_(VerifyResult{
                .request_id = request.request_id,
                .verified = false,
                .status = static_cast<uint8_t>(VerifyStatus::FAILED),
                .error_message = "verification failed (untrusted, non-IPA)",
                .source = request.source,
                .time_in_queue_ms = queue_ms,
                .time_in_verify_ms = std::chrono::duration<double, std::milli>(now - verify_start).count(),
            });
            continue;
        }

        // IPA verification
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        std::vector<OpeningClaim<curve::Grumpkin>> claims = { result.ipa_claim };
        std::vector<std::shared_ptr<NativeTranscript>> transcripts = { std::make_shared<NativeTranscript>(
            result.ipa_proof) };
        bool ipa_ok = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, claims, transcripts);
        auto verify_end = std::chrono::steady_clock::now();
        double verify_ms = std::chrono::duration<double, std::milli>(verify_end - verify_start).count();

        on_result_(VerifyResult{
            .request_id = request.request_id,
            .verified = ipa_ok,
            .status = static_cast<uint8_t>(ipa_ok ? VerifyStatus::OK : VerifyStatus::FAILED),
            .error_message = ipa_ok ? "" : "IPA verification failed (untrusted)",
            .source = request.source,
            .time_in_queue_ms = queue_ms,
            .time_in_verify_ms = verify_ms,
        });
    }
}

} // namespace bb
#endif
