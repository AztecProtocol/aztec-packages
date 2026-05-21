#pragma once

#include "ipc_client.hpp"
#include "shm/spsc_shm.hpp"
#include "shm_common.hpp"
#include <cassert>
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
        return ring_send_msg(request_ring_.value(), data, len, timeout_ns);
    }

    std::span<const uint8_t> receive(uint64_t timeout_ns) override
    {
        if (!response_ring_.has_value()) {
            return {};
        }
        return ring_receive_msg(response_ring_.value(), timeout_ns);
    }

    void release(size_t message_size) override
    {
        if (!response_ring_.has_value()) {
            return;
        }
        response_ring_->release(sizeof(uint32_t) + message_size);
    }

    void close() override
    {
        request_ring_.reset();
        response_ring_.reset();
    }

    void debug_dump() const
    {
        if (request_ring_.has_value()) {
            request_ring_->debug_dump("Client REQ");
        }
        if (response_ring_.has_value()) {
            response_ring_->debug_dump("Client RESP");
        }
    }

  private:
    std::string base_name_;
    std::optional<SpscShm> request_ring_;  // Client writes to this
    std::optional<SpscShm> response_ring_; // Client reads from this
};

} // namespace bb::ipc
