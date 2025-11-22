#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <iostream>
#include <optional>
#include <string>
#include <sys/mman.h>
#include <sys/types.h>
#include <unistd.h>
#include <utility>

namespace bb::ipc {

/**
 * @brief IPC server implementation using shared memory
 *
 * Uses SPSC (single-producer single-consumer) for both requests and responses.
 * Simple 1:1 client-server communication.
 */
class ShmServer : public IpcServer {
  public:
    static constexpr size_t DEFAULT_RING_SIZE = 1 << 20; // 1MB

    ShmServer(std::string base_name,
              size_t request_ring_size = DEFAULT_RING_SIZE,
              size_t response_ring_size = DEFAULT_RING_SIZE)
        : base_name_(std::move(base_name))
        , request_ring_size_(request_ring_size)
        , response_ring_size_(response_ring_size)
    {}

    ~ShmServer() override { close_internal(); }

    // Non-copyable, non-movable (owns shared memory resources)
    ShmServer(const ShmServer&) = delete;
    ShmServer& operator=(const ShmServer&) = delete;
    ShmServer(ShmServer&&) = delete;
    ShmServer& operator=(ShmServer&&) = delete;

    bool listen() override
    {
        if (request_ring_.has_value()) {
            return true; // Already listening
        }

        // Clean up any leftover shared memory
        std::string req_name = base_name_ + "_request";
        std::string resp_name = base_name_ + "_response";
        SpscShm::unlink(req_name);
        SpscShm::unlink(resp_name);

        try {
            // Create SPSC ring for requests (client writes, server reads)
            request_ring_ = SpscShm::create(req_name, request_ring_size_);

            // Create SPSC ring for responses (server writes, client reads)
            response_ring_ = SpscShm::create(resp_name, response_ring_size_);

            return true;
        } catch (...) {
            close(); // Cleanup on failure
            return false;
        }
    }

    int wait_for_data(uint64_t timeout_ns) override
    {
        if (!request_ring_.has_value()) {
            return -1;
        }

        // Wait for data in request ring, return client ID 0 (always single client)
        if (request_ring_->wait_for_data(sizeof(uint32_t), static_cast<uint32_t>(timeout_ns))) {
            return 0; // Single client, always ID 0
        }
        return -1; // Timeout
    }

    std::span<const uint8_t> receive(int client_id) override
    {
        (void)client_id; // Ignored, always single client
        if (!request_ring_.has_value()) {
            return {};
        }

        // Peek the length prefix (4 bytes) with blocking timeout
        void* len_ptr = request_ring_->peek(sizeof(uint32_t), 100000000); // 100ms timeout
        if (len_ptr == nullptr) {
            return {}; // Timeout or client disconnected
        }

        // Read message length
        uint32_t msg_len = 0;
        std::memcpy(&msg_len, len_ptr, sizeof(uint32_t));

        // Release the length prefix
        request_ring_->release(sizeof(uint32_t));

        // Now peek the message data with blocking timeout
        void* msg_ptr = request_ring_->peek(msg_len, 100000000);
        if (msg_ptr == nullptr) {
            return {}; // Timeout
        }

        // Return span directly into ring buffer (zero-copy!)
        return std::span<const uint8_t>(static_cast<const uint8_t*>(msg_ptr), msg_len);
    }

    void release(int client_id, size_t message_size) override
    {
        (void)client_id; // Ignored, always single client
        if (!request_ring_.has_value()) {
            return;
        }

        // Release just the message data (length prefix was already released in receive())
        request_ring_->release(message_size);
    }

    bool send(int client_id, const void* data, size_t len) override
    {
        (void)client_id; // Ignored, always single client
        if (!response_ring_.has_value()) {
            return false;
        }

        // Claim and publish length prefix separately
        void* len_buf = response_ring_->claim(sizeof(uint32_t), 100000000); // 100ms timeout
        if (len_buf == nullptr) {
            return false; // Timeout or no space
        }
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(len_buf, &len_u32, sizeof(uint32_t));
        response_ring_->publish(sizeof(uint32_t));

        // Claim and publish message data separately
        void* data_buf = response_ring_->claim(len, 100000000); // 100ms timeout
        if (data_buf == nullptr) {
            return false; // Timeout or no space
        }
        std::memcpy(data_buf, data, len);
        response_ring_->publish(len);

        return true;
    }

    void close() override { close_internal(); }

    void wakeup_all() override
    {
        // Wake any threads blocked in wait/peek/claim
        if (request_ring_.has_value()) {
            request_ring_->wakeup_all();
        }
        if (response_ring_.has_value()) {
            response_ring_->wakeup_all();
        }
    }

  private:
    void close_internal()
    {
        // Close rings
        request_ring_.reset();
        response_ring_.reset();

        // Clean up shared memory
        std::string req_name = base_name_ + "_request";
        std::string resp_name = base_name_ + "_response";
        SpscShm::unlink(req_name);
        SpscShm::unlink(resp_name);
    }

    std::string base_name_;
    size_t request_ring_size_;
    size_t response_ring_size_;
    std::optional<SpscShm> request_ring_;  // Server reads from this
    std::optional<SpscShm> response_ring_; // Server writes to this
};

} // namespace bb::ipc
