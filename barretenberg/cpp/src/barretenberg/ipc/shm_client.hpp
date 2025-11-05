#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/shm/mpsc_shm.hpp"
#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <atomic>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <optional>
#include <string>
#include <sys/mman.h>
#include <sys/types.h>
#include <unistd.h>
#include <utility>

namespace bb::ipc {

/**
 * @brief IPC client implementation using shared memory
 *
 * Uses MPSC (multi-producer single-consumer) for requests and SPSC for responses.
 * Each client atomically claims a unique ID and gets dedicated response ring.
 */
class ShmClient : public IpcClient {
  public:
    ShmClient(std::string base_name, size_t max_clients)
        : base_name_(std::move(base_name))
        , max_clients_(max_clients)
    {}

    ~ShmClient() override { close_internal(); }

    // Non-copyable, non-movable (owns shared memory resources)
    ShmClient(const ShmClient&) = delete;
    ShmClient& operator=(const ShmClient&) = delete;
    ShmClient(ShmClient&&) = delete;
    ShmClient& operator=(ShmClient&&) = delete;

    bool connect() override
    {
        if (producer_.has_value()) {
            return true; // Already connected
        }

        // Atomically claim a client ID from shared counter
        std::string id_name = base_name_ + "_next_id";
        int id_fd = shm_open(id_name.c_str(), O_RDWR, 0666);
        if (id_fd < 0) {
            return false;
        }

        auto* next_id = static_cast<std::atomic<uint32_t>*>(
            mmap(nullptr, sizeof(std::atomic<uint32_t>), PROT_READ | PROT_WRITE, MAP_SHARED, id_fd, 0));

        if (next_id == MAP_FAILED) {
            ::close(id_fd);
            return false;
        }

        client_id_ = next_id->fetch_add(1, std::memory_order_relaxed);
        munmap(next_id, sizeof(std::atomic<uint32_t>));
        ::close(id_fd);

        if (client_id_ >= max_clients_) {
            return false; // Too many clients
        }

        try {
            // Connect as MPSC producer for requests
            producer_ = MpscProducer::connect(base_name_, client_id_);

            // Connect to dedicated SPSC response ring
            std::string resp_name = base_name_ + "_response_" + std::to_string(client_id_);
            response_ring_ = SpscShm::connect(resp_name);

            return true;
        } catch (...) {
            producer_.reset();
            response_ring_.reset();
            return false;
        }
    }

    bool send(const void* data, size_t len, uint64_t timeout_ns) override
    {
        (void)timeout_ns; // TODO(charlie): Use timeout parameter

        if (!producer_.has_value()) {
            return false;
        }

        // Add 4-byte length prefix to match socket behavior
        size_t total_len = sizeof(uint32_t) + len;
        uint32_t spin_time_ns = 10000000; // 10ms

        // Wait for enough space
        if (!producer_->wait_for_space(total_len, spin_time_ns)) {
            return false;
        }

        // Claim space
        size_t granted = 0;
        void* buf = producer_->claim(total_len, &granted);
        if (granted < total_len) {
            return false; // Not enough space
        }

        // Write message with length prefix
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(buf, &len_u32, sizeof(uint32_t));
        std::memcpy(static_cast<uint8_t*>(buf) + sizeof(uint32_t), data, len);
        producer_->publish(total_len);

        return true;
    }

    ssize_t recv(void* buffer, size_t max_len, uint64_t timeout_ns) override
    {
        if (!response_ring_.has_value()) {
            return -1;
        }

        uint32_t spin_time_ns = 10000000; // 10ms
        const int max_retries = timeout_ns > 0 ? static_cast<int>(timeout_ns / spin_time_ns) : 100;

        for (int retry = 0; retry < max_retries; retry++) {
            if (response_ring_->wait_for_data(spin_time_ns)) {
                // Data available - peek skips padding automatically
                size_t n = 0;
                void* data = response_ring_->peek(&n);
                if (data == nullptr || n < sizeof(uint32_t)) {
                    if (n > 0) {
                        response_ring_->release(n);
                    }
                    continue;
                }

                // Read length prefix
                uint32_t msg_len = 0;
                std::memcpy(&msg_len, data, sizeof(uint32_t));

                if (n < sizeof(uint32_t) + msg_len) {
                    // Incomplete message - wait and retry
                    continue;
                }

                if (msg_len > max_len) {
                    response_ring_->release(sizeof(uint32_t) + msg_len);
                    return -1; // Buffer too small
                }

                // Copy message data (skip length prefix)
                std::memcpy(buffer, static_cast<const uint8_t*>(data) + sizeof(uint32_t), msg_len);
                response_ring_->release(sizeof(uint32_t) + msg_len);

                return static_cast<ssize_t>(msg_len);
            }
        }

        return -1; // Timeout
    }

    void close() override { close_internal(); }

  private:
    void close_internal()
    {
        response_ring_.reset();
        producer_.reset();
    }

    std::string base_name_;
    size_t max_clients_;
    uint32_t client_id_ = 0;
    std::optional<MpscProducer> producer_;
    std::optional<SpscShm> response_ring_;
};

} // namespace bb::ipc
