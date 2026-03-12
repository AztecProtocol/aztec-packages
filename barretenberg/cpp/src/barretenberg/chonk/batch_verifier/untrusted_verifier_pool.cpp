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

    for (auto it = queue_.begin(); it != queue_.end(); ++it) {
        if (it->request_id == request_id) {
            on_result_(VerifyResult::cancelled(request_id, it->source));
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
            on_result_(VerifyResult::cancelled(it->request_id, source));
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

            if (cancelled_ids_.count(request.request_id)) {
                cancelled_ids_.erase(request.request_id);
                on_result_(VerifyResult::cancelled(request.request_id, request.source));
                continue;
            }
        }

        set_parallel_for_concurrency(get_num_cpus());

        auto verify_start = std::chrono::steady_clock::now();
        double queue_ms = ms_between(request.enqueue_time, verify_start);

        // Validate VK index
        if (request.vk_index >= vks_.size()) {
            auto result = VerifyResult::failed(
                request.request_id, request.source, "invalid vk_index: " + std::to_string(request.vk_index));
            result.time_in_queue_ms = queue_ms;
            on_result_(std::move(result));
            continue;
        }

        // Full individual verification (reduce + IPA)
        ChonkNativeVerifier verifier(vks_[request.vk_index]);
        auto reduced = verifier.reduce_to_ipa_claim(request.proof);

        if (!reduced.all_checks_passed) {
            auto result =
                VerifyResult::failed(request.request_id, request.source, "verification failed (untrusted, non-IPA)");
            result.time_in_queue_ms = queue_ms;
            result.time_in_verify_ms = ms_since(verify_start);
            on_result_(std::move(result));
            continue;
        }

        // IPA verification
        auto ipa_vk = VerifierCommitmentKey<curve::Grumpkin>{ ECCVMFlavor::ECCVM_FIXED_SIZE };
        std::vector<OpeningClaim<curve::Grumpkin>> claims = { reduced.ipa_claim };
        std::vector<std::shared_ptr<NativeTranscript>> transcripts = { std::make_shared<NativeTranscript>(
            reduced.ipa_proof) };
        bool ipa_ok = IPA<curve::Grumpkin>::batch_reduce_verify(ipa_vk, claims, transcripts);
        double verify_ms = ms_since(verify_start);

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
