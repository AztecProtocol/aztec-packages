#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/shm/spsc_shm.hpp"
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
 * Uses SPSC (single-producer single-consumer) for both requests and responses.
 * Simple 1:1 client-server communication.
 */
class ShmClient : public IpcClient {
  public:
    explicit ShmClient(std::string base_name)
        : base_name_(std::move(base_name))
    {}

    ~ShmClient() override = default;

    // Non-copyable, non-movable (owns shared memory resources)
    ShmClient(const ShmClient&) = delete;
    ShmClient& operator=(const ShmClient&) = delete;
    ShmClient(ShmClient&&) = delete;
    ShmClient& operator=(ShmClient&&) = delete;

    bool connect() override
    {
        if (request_ring_.has_value()) {
            return true; // Already connected
        }

        try {
            // Connect to request ring (client writes, server reads)
            std::string req_name = base_name_ + "_request";
            request_ring_ = SpscShm::connect(req_name);

            // Connect to response ring (server writes, client reads)
            std::string resp_name = base_name_ + "_response";
            response_ring_ = SpscShm::connect(resp_name);

            return true;
        } catch (...) {
            request_ring_.reset();
            response_ring_.reset();
            return false;
        }
    }

    bool send(const void* data, size_t len, uint64_t timeout_ns) override
    {
        if (!request_ring_.has_value()) {
            return false;
        }

        // Claim and publish length prefix
        void* len_buf = request_ring_->claim(sizeof(uint32_t), static_cast<uint32_t>(timeout_ns));
        if (len_buf == nullptr) {
            return false; // Timeout or no space
        }
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(len_buf, &len_u32, sizeof(uint32_t));
        request_ring_->publish(sizeof(uint32_t));

        // Claim and publish message data
        void* data_buf = request_ring_->claim(len, static_cast<uint32_t>(timeout_ns));
        if (data_buf == nullptr) {
            return false; // Timeout or no space
        }
        std::memcpy(data_buf, data, len);
        request_ring_->publish(len);

        return true;
    }

    std::span<const uint8_t> recv(uint64_t timeout_ns) override
    {
        if (!response_ring_.has_value()) {
            return {};
        }

        // Peek the length prefix (4 bytes)
        void* len_ptr = response_ring_->peek(sizeof(uint32_t), static_cast<uint32_t>(timeout_ns));
        if (len_ptr == nullptr) {
            return {}; // Timeout
        }

        // Read message length
        uint32_t msg_len = 0;
        std::memcpy(&msg_len, len_ptr, sizeof(uint32_t));

        // Release the length prefix
        response_ring_->release(sizeof(uint32_t));

        // Now peek the message data
        void* msg_ptr = response_ring_->peek(msg_len, static_cast<uint32_t>(timeout_ns));
        if (msg_ptr == nullptr) {
            return {}; // Timeout
        }

        // Return span directly into ring buffer (zero-copy!)
        return std::span<const uint8_t>(static_cast<const uint8_t*>(msg_ptr), msg_len);
    }

    void release(size_t message_size) override
    {
        if (!response_ring_.has_value()) {
            return;
        }

        // Release just the message data (length prefix was already released in recv())
        response_ring_->release(message_size);
    }

    void close() override
    {
        request_ring_.reset();
        response_ring_.reset();
    }

  private:
    std::string base_name_;
    std::optional<SpscShm> request_ring_;  // Client writes to this
    std::optional<SpscShm> response_ring_; // Client reads from this
};

} // namespace bb::ipc
