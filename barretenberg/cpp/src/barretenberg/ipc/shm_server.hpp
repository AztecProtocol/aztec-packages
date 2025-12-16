#pragma once

#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/shm/mpsc_shm.hpp"
#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <atomic>
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
#include <vector>

namespace bb::ipc {

/**
 * @brief IPC server implementation using shared memory
 *
 * Uses MPSC (multi-producer single-consumer) for receiving requests from multiple clients.
 * Each client gets a dedicated SPSC ring for responses.
 */
class ShmServer : public IpcServer {
  public:
    static constexpr size_t DEFAULT_RING_SIZE = 1 << 20; // 1MB

    ShmServer(std::string base_name,
              size_t max_clients,
              size_t request_ring_size = DEFAULT_RING_SIZE,
              size_t response_ring_size = DEFAULT_RING_SIZE)
        : base_name_(std::move(base_name))
        , max_clients_(max_clients)
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
        if (consumer_.has_value()) {
            return true; // Already listening
        }

        // Clean up any leftover shared memory
        MpscConsumer::unlink(base_name_, max_clients_);
        for (size_t i = 0; i < max_clients_; i++) {
            std::string resp_name = base_name_ + "_response_" + std::to_string(i);
            SpscShm::unlink(resp_name);
        }
        std::string id_name = base_name_ + "_next_id";
        shm_unlink(id_name.c_str());

        try {
            // Create MPSC consumer for requests
            consumer_ = MpscConsumer::create(base_name_, max_clients_, request_ring_size_);

            // Create client ID allocator in shared memory
            int id_fd = shm_open(id_name.c_str(), O_CREAT | O_RDWR, 0666);
            if (id_fd < 0) {
                consumer_.reset();
                return false;
            }

            if (ftruncate(id_fd, sizeof(std::atomic<uint32_t>)) < 0) {
                ::close(id_fd);
                shm_unlink(id_name.c_str());
                consumer_.reset();
                return false;
            }

            auto* next_id = static_cast<std::atomic<uint32_t>*>(
                mmap(nullptr, sizeof(std::atomic<uint32_t>), PROT_READ | PROT_WRITE, MAP_SHARED, id_fd, 0));

            if (next_id == MAP_FAILED) {
                ::close(id_fd);
                shm_unlink(id_name.c_str());
                consumer_.reset();
                return false;
            }

            next_id->store(0, std::memory_order_relaxed);
            munmap(next_id, sizeof(std::atomic<uint32_t>));
            ::close(id_fd);

            // Pre-create all response rings
            response_rings_.reserve(max_clients_);
            for (size_t i = 0; i < max_clients_; i++) {
                std::string resp_name = base_name_ + "_response_" + std::to_string(i);
                response_rings_.push_back(SpscShm::create(resp_name, response_ring_size_));
            }

            return true;
        } catch (...) {
            close(); // Cleanup on failure
            return false;
        }
    }

    int wait_for_data(uint64_t timeout_ns) override
    {
        if (!consumer_.has_value()) {
            return -1;
        }

        // Pass timeout directly in nanoseconds
        return consumer_->wait_for_data(static_cast<uint32_t>(timeout_ns));
    }

    std::span<const uint8_t> receive(int client_id) override
    {
        if (!consumer_.has_value() || client_id < 0) {
            return {};
        }
        const auto client_idx = static_cast<size_t>(client_id);
        if (client_idx >= max_clients_) {
            return {};
        }

        // Wait for data to be available (blocks until data present)
        consumer_->wait_for_data(100000); // Spin for 100ms before yielding

        // Peek at data in ring buffer (zero-copy!)
        size_t n = 0;
        void* data = consumer_->peek(client_idx, &n);

        if (data == nullptr) {
            return {}; // Client disconnected or error
        }

        // Handle implicit padding: if we get less than 4 bytes, it's padding at ring wrap boundary
        // Release it and retry
        if (n < sizeof(uint32_t)) {
            consumer_->release(client_idx, n);
            // Retry peek after releasing padding
            data = consumer_->peek(client_idx, &n);
            if (data == nullptr || n < sizeof(uint32_t)) {
                // Still no valid data after skipping padding
                return {};
            }
        }

        // Read length prefix
        uint32_t msg_len = 0;
        std::memcpy(&msg_len, data, sizeof(uint32_t));

        if (n < sizeof(uint32_t) + msg_len) {
            throw_or_abort("Ring buffer corruption: incomplete message (protocol violation)");
        }

        // Return span directly into ring buffer (skip 4-byte length prefix, zero-copy!)
        return std::span<const uint8_t>(static_cast<const uint8_t*>(data) + sizeof(uint32_t), msg_len);
    }

    void release(int client_id, size_t message_size) override
    {
        if (!consumer_.has_value() || client_id < 0) {
            return;
        }
        const auto client_idx = static_cast<size_t>(client_id);
        if (client_idx >= max_clients_) {
            return;
        }

        // Release the entire message (length prefix + data)
        size_t total_size = sizeof(uint32_t) + message_size;
        consumer_->release(client_idx, total_size);
    }

    bool send(int client_id, const void* data, size_t len) override
    {
        if (!consumer_.has_value() || client_id < 0) {
            return false;
        }
        const auto client_idx = static_cast<size_t>(client_id);
        if (client_idx >= max_clients_) {
            return false;
        }

        SpscShm& response_ring = response_rings_[client_idx];

        // Add 4-byte length prefix to match socket behavior
        size_t total_len = sizeof(uint32_t) + len;

        if (!response_ring.wait_for_space(total_len, 10000000)) { // 10ms
            return false;
        }

        // Claim handles wrapping internally
        size_t granted = 0;
        void* buf = response_ring.claim(total_len, &granted);
        if (granted < total_len) {
            return false;
        }

        // Write length prefix then data
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(buf, &len_u32, sizeof(uint32_t));
        std::memcpy(static_cast<uint8_t*>(buf) + sizeof(uint32_t), data, len);
        response_ring.publish(total_len);

        return true;
    }

    void close() override { close_internal(); }

    void wakeup_all() override
    {
        // Wake consumer blocked in wait_for_data
        if (consumer_.has_value()) {
            consumer_->wakeup_all();
        }

        // Wake any clients blocked in response rings
        for (auto& ring : response_rings_) {
            ring.wakeup_all();
        }
    }

  private:
    void close_internal()
    {
        // Close all response rings
        response_rings_.clear();

        // Close consumer
        consumer_.reset();

        // Clean up shared memory
        MpscConsumer::unlink(base_name_, max_clients_);
        for (size_t i = 0; i < max_clients_; i++) {
            std::string resp_name = base_name_ + "_response_" + std::to_string(i);
            SpscShm::unlink(resp_name);
        }
        std::string id_name = base_name_ + "_next_id";
        shm_unlink(id_name.c_str());
    }

    std::string base_name_;
    size_t max_clients_;
    size_t request_ring_size_;
    size_t response_ring_size_;
    std::optional<MpscConsumer> consumer_;
    std::vector<SpscShm> response_rings_;
};

} // namespace bb::ipc
