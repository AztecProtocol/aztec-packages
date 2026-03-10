#ifndef __wasm__
#include "chonk_batch_verifier_service.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

#include <fcntl.h>
#include <sys/stat.h>
#include <unistd.h>

namespace bb {

void ChonkBatchVerifierService::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                                      const std::string& output_fifo_path,
                                      const BatchVerifierConfig& config)
{
    shutdown_ = false;

    // Create and open FIFO
    mkfifo(output_fifo_path.c_str(), 0600);
    output_fd_ = open(output_fifo_path.c_str(), O_WRONLY);
    if (output_fd_ < 0) {
        throw_or_abort("ChonkBatchVerifierService: failed to open output FIFO: " + output_fifo_path);
    }

    // Start writer thread
    writer_thread_ = std::thread([this]() { writer_loop(); });

    // Shared result callback for both processors
    auto on_result = [this](VerifyResult result) { emit_result(std::move(result)); };

    // Start both processors
    trusted_processor_.start(
        vks, config.num_ipa_cores, config.num_sumcheck_cores, config.trusted_batch_size, on_result);
    untrusted_pool_.start(std::move(vks), config.num_untrusted_cores, on_result);

    info("ChonkBatchVerifierService started");
}

bool ChonkBatchVerifierService::queue(VerifyRequest request)
{
    if (request.trusted) {
        trusted_processor_.enqueue(std::move(request));
    } else {
        untrusted_pool_.enqueue(std::move(request));
    }
    return true;
}

bool ChonkBatchVerifierService::cancel(uint64_t request_id)
{
    // Try both pools — request could be in either
    bool found = trusted_processor_.cancel(request_id);
    if (!found) {
        found = untrusted_pool_.cancel(request_id);
    }
    return true;
}

uint32_t ChonkBatchVerifierService::cancel_by_source(const std::string& source)
{
    uint32_t count = trusted_processor_.cancel_by_source(source);
    count += untrusted_pool_.cancel_by_source(source);
    return count;
}

void ChonkBatchVerifierService::stop()
{
    // Stop both processors (blocks until all work drained)
    trusted_processor_.stop();
    untrusted_pool_.stop();

    // Signal writer thread shutdown
    shutdown_ = true;
    result_cv_.notify_all();

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
