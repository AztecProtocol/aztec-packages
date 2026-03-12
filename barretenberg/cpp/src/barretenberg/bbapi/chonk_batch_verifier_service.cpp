#ifndef __wasm__
#include "chonk_batch_verifier_service.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/serialize/msgpack.hpp"

#include <cstdint>
#include <fcntl.h>
#include <fstream>
#include <unistd.h>

namespace bb {

void ChonkBatchVerifierService::start(std::vector<std::shared_ptr<MegaZKFlavor::VKAndHash>> vks,
                                      BatchVerifierConfig config,
                                      const std::string& fifo_path)
{
    if (running_) {
        info("ChonkBatchVerifierService: already running, ignoring start()");
        return;
    }

    uint32_t num_cores = config.num_cores;
    if (num_cores == 0) {
        num_cores = static_cast<uint32_t>(std::thread::hardware_concurrency());
        if (num_cores == 0) {
            num_cores = 1;
        }
    }

    writer_shutdown_ = false;
    running_ = true;

    // Start the writer thread (opens the FIFO, drains result_queue_)
    writer_thread_ = std::thread([this, path = fifo_path]() { writer_loop(path); });

    // Start the batch processor with a callback that pushes to result_queue_
    verifier_.start(std::move(vks), num_cores, config.batch_size, [this](VerifyResult result) {
        {
            std::lock_guard lock(result_mutex_);
            result_queue_.push(std::move(result));
        }
        result_cv_.notify_one();
    });

    info("ChonkBatchVerifierService started, fifo=", fifo_path);
}

void ChonkBatchVerifierService::enqueue(VerifyRequest request)
{
    verifier_.enqueue(std::move(request));
}

void ChonkBatchVerifierService::stop()
{
    if (!running_) {
        return;
    }

    // Stop the processor first (flushes remaining proofs → result_queue_)
    verifier_.stop();

    // Signal the writer to drain and exit
    {
        std::lock_guard lock(result_mutex_);
        writer_shutdown_ = true;
    }
    result_cv_.notify_one();

    if (writer_thread_.joinable()) {
        writer_thread_.join();
    }

    running_ = false;
    info("ChonkBatchVerifierService stopped");
}

ChonkBatchVerifierService::~ChonkBatchVerifierService()
{
    if (running_) {
        stop();
    }
}

void ChonkBatchVerifierService::writer_loop(const std::string& fifo_path)
{
    // Open FIFO for writing (blocks until a reader connects)
    int fd = open(fifo_path.c_str(), O_WRONLY);
    if (fd < 0) {
        info("ChonkBatchVerifierService: failed to open FIFO '", fifo_path, "': ", strerror(errno));
        return;
    }

    auto write_all = [fd](const void* data, size_t len) -> bool {
        const auto* ptr = static_cast<const uint8_t*>(data);
        size_t remaining = len;
        while (remaining > 0) {
            auto written = ::write(fd, ptr, remaining);
            if (written <= 0) {
                return false;
            }
            ptr += written;
            remaining -= static_cast<size_t>(written);
        }
        return true;
    };

    while (true) {
        VerifyResult result;
        {
            std::unique_lock lock(result_mutex_);
            result_cv_.wait(lock, [this] { return writer_shutdown_ || !result_queue_.empty(); });

            if (!result_queue_.empty()) {
                result = std::move(result_queue_.front());
                result_queue_.pop();
            } else if (writer_shutdown_) {
                break;
            } else {
                continue;
            }
        }

        // Serialize to msgpack
        msgpack::sbuffer buf;
        msgpack::pack(buf, result);

        // Write [4-byte BE length][payload]
        uint32_t len = static_cast<uint32_t>(buf.size());
        uint8_t len_bytes[4] = {
            static_cast<uint8_t>((len >> 24) & 0xFF),
            static_cast<uint8_t>((len >> 16) & 0xFF),
            static_cast<uint8_t>((len >> 8) & 0xFF),
            static_cast<uint8_t>(len & 0xFF),
        };

        if (!write_all(len_bytes, 4) || !write_all(buf.data(), buf.size())) {
            info("ChonkBatchVerifierService: FIFO write failed, stopping writer");
            break;
        }
    }

    close(fd);
}

} // namespace bb
#endif
