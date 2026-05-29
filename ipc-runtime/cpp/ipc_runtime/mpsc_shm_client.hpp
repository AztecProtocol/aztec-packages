#pragma once

#include "ipc_client.hpp"
#include "shm/mpsc_shm.hpp"
#include "shm/spsc_shm.hpp"
#include "shm_common.hpp"
#include <cassert>
#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <utility>

namespace ipc {

/**
 * @brief IPC client for multi-client shared memory server
 *
 * Uses MpscProducer for sending requests and a dedicated SPSC ring for
 * receiving responses. Each client is assigned a unique client_id.
 */
class MpscShmClient : public IpcClient {
  public:
    MpscShmClient(std::string base_name, size_t client_id)
        : base_name_(std::move(base_name))
        , client_id_(client_id)
    {}

    ~MpscShmClient() override = default;

    // Non-copyable, non-movable
    MpscShmClient(const MpscShmClient&) = delete;
    MpscShmClient& operator=(const MpscShmClient&) = delete;
    MpscShmClient(MpscShmClient&&) = delete;
    MpscShmClient& operator=(MpscShmClient&&) = delete;

    bool connect() override
    {
        if (producer_.has_value()) {
            return true; // Already connected
        }

        try {
            // Connect as producer to the MPSC request system
            producer_ = MpscProducer::connect(base_name_ + "_req", client_id_);

            // Connect to our dedicated SPSC response ring
            std::string resp_name = base_name_ + "_resp_" + std::to_string(client_id_);
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
        if (!producer_.has_value()) {
            return false;
        }

        // Claim space for length prefix + data
        size_t total_size = sizeof(uint32_t) + len;
        void* buf = producer_->claim(total_size, static_cast<uint32_t>(timeout_ns));
        if (buf == nullptr) {
            return false;
        }

        // Write length prefix + data
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(buf, &len_u32, sizeof(uint32_t));
        std::memcpy(static_cast<uint8_t*>(buf) + sizeof(uint32_t), data, len);

        // Publish (rings doorbell to wake server)
        producer_->publish(total_size);
        return true;
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
        producer_.reset();
        response_ring_.reset();
    }

  private:
    std::string base_name_;
    size_t client_id_;
    std::optional<MpscProducer> producer_;
    std::optional<SpscShm> response_ring_;
};

} // namespace ipc
