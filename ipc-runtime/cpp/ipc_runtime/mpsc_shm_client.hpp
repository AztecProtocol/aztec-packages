#pragma once

#include "constants.hpp"
#include "ipc_client.hpp"
#include "shm/mpsc_shm.hpp"
#include "shm/spsc_shm.hpp"
#include "shm_common.hpp"
#include <cassert>
#include <chrono>
#include <cstdint>
#include <cstring>
#include <optional>
#include <string>
#include <thread>
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
    // client_id == kAutoClientId (the default for make_client / create_mpsc_shm)
    // makes connect() atomically claim a free producer slot from the server's
    // shared slot table, so callers don't have to coordinate unique ids. An
    // explicit id pins a specific slot (used by tests).
    MpscShmClient(std::string base_name, size_t client_id)
        : base_name_(std::move(base_name))
        , auto_claim_(client_id == kAutoClientId)
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

        constexpr size_t max_attempts = CONNECT_RETRY_BUDGET_MS / CONNECT_RETRY_DELAY_MS;
        constexpr auto retry_delay = std::chrono::milliseconds(CONNECT_RETRY_DELAY_MS);

        for (size_t attempt = 0; attempt < max_attempts; ++attempt) {
            try {
                // Self-allocate a producer slot when no explicit id was given.
                // The claim is held for the connection's lifetime and released by
                // close()/destruction so the slot can be reused.
                if (auto_claim_) {
                    slot_claim_ = MpscSlotClaim::claim(base_name_ + "_req");
                    client_id_ = slot_claim_->id();
                }

                // Connect as producer to the MPSC request system
                producer_ = MpscProducer::connect(base_name_ + "_req", client_id_);

                // Connect to our dedicated SPSC response ring
                std::string resp_name = base_name_ + "_resp_" + std::to_string(client_id_);
                response_ring_ = SpscShm::connect(resp_name);

                return true;
            } catch (...) {
                producer_.reset();
                response_ring_.reset();
                slot_claim_.reset();
                if (attempt + 1 == max_attempts) {
                    return false;
                }
                std::this_thread::sleep_for(retry_delay);
            }
        }

        return false;
    }

    bool send(const void* data, size_t len, uint64_t timeout_ns) override
    {
        if (!producer_.has_value()) {
            return false;
        }

        // Claim space for length prefix + data
        size_t total_size = sizeof(uint32_t) + len;
        void* buf = producer_->claim(total_size, normalize_call_timeout(timeout_ns));
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
        return ring_receive_msg(response_ring_.value(), normalize_call_timeout(timeout_ns));
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
        slot_claim_.reset(); // release our producer slot for reuse
    }

    void wakeup() override
    {
        if (response_ring_.has_value()) {
            response_ring_->wakeup_all();
        }
    }

  private:
    std::string base_name_;
    bool auto_claim_;
    size_t client_id_;
    std::optional<MpscSlotClaim> slot_claim_;
    std::optional<MpscProducer> producer_;
    std::optional<SpscShm> response_ring_;
};

} // namespace ipc
