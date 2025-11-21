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
        if (!producer_.has_value()) {
            return false;
        }

        uint32_t timeout_ns_u32 = (timeout_ns > UINT32_MAX) ? UINT32_MAX : static_cast<uint32_t>(timeout_ns);

        // Claim and publish length prefix separately
        void* len_buf = producer_->claim(sizeof(uint32_t), timeout_ns_u32);
        if (len_buf == nullptr) {
            return false; // Timeout or no space
        }
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(len_buf, &len_u32, sizeof(uint32_t));
        producer_->publish(sizeof(uint32_t));

        // Claim and publish message data separately
        void* data_buf = producer_->claim(len, timeout_ns_u32);
        if (data_buf == nullptr) {
            return false; // Timeout or no space
        }
        std::memcpy(data_buf, data, len);
        producer_->publish(len);

        return true;
    }

    std::span<const uint8_t> recv(uint64_t timeout_ns) override
    {
        if (!response_ring_.has_value()) {
            return {};
        }

        uint32_t timeout_ns_u32 = (timeout_ns > UINT32_MAX) ? UINT32_MAX : static_cast<uint32_t>(timeout_ns);

        // Peek and release the length prefix (4 bytes)
        void* len_ptr = response_ring_->peek(sizeof(uint32_t), timeout_ns_u32);
        if (len_ptr == nullptr) {
            return {}; // Timeout
        }

        // Read the message length
        uint32_t msg_len = 0;
        std::memcpy(&msg_len, len_ptr, sizeof(uint32_t));

        // Release the length prefix
        response_ring_->release(sizeof(uint32_t));

        // Now peek the message data (do NOT release yet - caller will release)
        void* msg_ptr = response_ring_->peek(msg_len, timeout_ns_u32);
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

        // Release the message data
        response_ring_->release(message_size);
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
