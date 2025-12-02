#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "ipc_server.hpp"
#include "shm/spsc_shm.hpp"
#include "shm_common.hpp"
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

    ~ShmServer() override { close(); }

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
        assert(request_ring_);
        if (!request_ring_.has_value()) {
            return -1;
        }

        // Wait for data in request ring, return client ID 0 (always single client)
        if (request_ring_->wait_for_data(sizeof(uint32_t), static_cast<uint32_t>(timeout_ns))) {
            return 0; // Single client, always ID 0
        }
        return -1; // Timeout
    }

    std::span<const uint8_t> receive([[maybe_unused]] int client_id) override
    {
        if (!request_ring_.has_value()) {
            return {};
        }
        // TODO: Plumb timeout.
        return ring_receive_msg(request_ring_.value(), 100000000); // 100ms timeout
    }

    void release([[maybe_unused]] int client_id, size_t message_size) override
    {
        if (!request_ring_.has_value()) {
            return;
        }
        request_ring_->release(sizeof(uint32_t) + message_size);
    }

    bool send([[maybe_unused]] int client_id, const void* data, size_t len) override
    {
        if (!response_ring_.has_value()) {
            return false;
        }
        return ring_send_msg(response_ring_.value(), data, len, 100000000);
    }

    void close() override
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

    void debug_dump() const
    {
        if (request_ring_.has_value()) {
            request_ring_->debug_dump("Server REQ");
        }
        if (response_ring_.has_value()) {
            response_ring_->debug_dump("Server RESP");
        }
    }

  private:
    std::string base_name_;
    size_t request_ring_size_;
    size_t response_ring_size_;
    std::optional<SpscShm> request_ring_;  // Server reads from this
    std::optional<SpscShm> response_ring_; // Server writes to this
};

} // namespace bb::ipc
