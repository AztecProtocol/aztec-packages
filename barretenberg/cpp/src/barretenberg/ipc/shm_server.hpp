#pragma once

#include "barretenberg/ipc/ipc_server.hpp"
#include "barretenberg/ipc/shm/mpsc_shm.h"
#include "barretenberg/ipc/shm/spsc_shm.h"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <string>
#include <sys/mman.h>
#include <unistd.h>
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

    ShmServer(std::string base_name, size_t max_clients, size_t ring_size = DEFAULT_RING_SIZE)
        : base_name_(std::move(base_name))
        , max_clients_(max_clients)
        , ring_size_(ring_size)
    {}

    ~ShmServer() override { close(); }

    bool listen() override
    {
        if (consumer_) {
            return true; // Already listening
        }

        // Clean up any leftover shared memory
        mpsc_unlink(base_name_.c_str(), max_clients_);
        for (size_t i = 0; i < max_clients_; i++) {
            std::string resp_name = base_name_ + "_response_" + std::to_string(i);
            spsc_shm_unlink(resp_name.c_str());
        }
        std::string id_name = base_name_ + "_next_id";
        shm_unlink(id_name.c_str());

        // Create MPSC consumer for requests
        consumer_ = mpsc_consumer_create(base_name_.c_str(), max_clients_, ring_size_);
        if (!consumer_) {
            return false;
        }

        // Create client ID allocator in shared memory
        int id_fd = shm_open(id_name.c_str(), O_CREAT | O_RDWR, 0666);
        if (id_fd < 0) {
            mpsc_consumer_close(consumer_);
            consumer_ = nullptr;
            return false;
        }

        if (ftruncate(id_fd, sizeof(std::atomic<uint32_t>)) < 0) {
            ::close(id_fd);
            shm_unlink(id_name.c_str());
            mpsc_consumer_close(consumer_);
            consumer_ = nullptr;
            return false;
        }

        auto* next_id = static_cast<std::atomic<uint32_t>*>(
            mmap(nullptr, sizeof(std::atomic<uint32_t>), PROT_READ | PROT_WRITE, MAP_SHARED, id_fd, 0));

        if (next_id == MAP_FAILED) {
            ::close(id_fd);
            shm_unlink(id_name.c_str());
            mpsc_consumer_close(consumer_);
            consumer_ = nullptr;
            return false;
        }

        next_id->store(0, std::memory_order_relaxed);
        munmap(next_id, sizeof(std::atomic<uint32_t>));
        ::close(id_fd);

        // Pre-create all response rings
        response_rings_.resize(max_clients_);
        for (size_t i = 0; i < max_clients_; i++) {
            std::string resp_name = base_name_ + "_response_" + std::to_string(i);
            response_rings_[i] = spsc_shm_create(resp_name.c_str(), ring_size_);
            if (!response_rings_[i]) {
                close(); // Cleanup on failure
                return false;
            }
        }

        return true;
    }

    int wait_for_data(uint64_t timeout_ns) override
    {
        if (!consumer_) {
            return -1;
        }

        uint64_t timeout_us = timeout_ns > 0 ? timeout_ns / 1000 : 100000; // Default 100ms
        return mpsc_wait_for_data(consumer_, static_cast<uint32_t>(timeout_us));
    }

    ssize_t recv(int client_id, void* buffer, size_t max_len) override
    {
        if (!consumer_ || client_id < 0 || static_cast<size_t>(client_id) >= max_clients_) {
            return -1;
        }

        size_t n = 0;
        void* data = mpsc_peek(consumer_, static_cast<size_t>(client_id), &n);
        if (!data || n < sizeof(uint32_t)) {
            if (n > 0) {
                mpsc_release(consumer_, static_cast<size_t>(client_id), n);
            }
            return -1;
        }

        // Read length prefix
        uint32_t msg_len = 0;
        std::memcpy(&msg_len, data, sizeof(uint32_t));

        if (n < sizeof(uint32_t) + msg_len) {
            mpsc_release(consumer_, static_cast<size_t>(client_id), n);
            return -1; // Incomplete message
        }

        if (msg_len > max_len) {
            mpsc_release(consumer_, static_cast<size_t>(client_id), sizeof(uint32_t) + msg_len);
            return -1; // Buffer too small
        }

        // Copy message data (skip length prefix)
        std::memcpy(buffer, static_cast<const uint8_t*>(data) + sizeof(uint32_t), msg_len);
        mpsc_release(consumer_, static_cast<size_t>(client_id), sizeof(uint32_t) + msg_len);

        return static_cast<ssize_t>(msg_len);
    }

    bool send(int client_id, const void* data, size_t len) override
    {
        if (!consumer_ || client_id < 0 || static_cast<size_t>(client_id) >= max_clients_) {
            return false;
        }

        struct spsc_shm* response_ring = response_rings_[static_cast<size_t>(client_id)];
        if (!response_ring) {
            return false;
        }

        // Add 4-byte length prefix to match socket behavior
        size_t total_len = sizeof(uint32_t) + len;

        if (!spsc_wait_for_space(response_ring, total_len, 1000000)) { // 1s timeout
            return false;
        }

        size_t granted = 0;
        void* buf = spsc_claim(response_ring, total_len, &granted);
        if (granted < total_len) {
            return false;
        }

        // Write length prefix then data
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(buf, &len_u32, sizeof(uint32_t));
        std::memcpy(static_cast<uint8_t*>(buf) + sizeof(uint32_t), data, len);
        spsc_publish(response_ring, total_len);

        return true;
    }

    void close() override
    {
        // Close all response rings
        for (auto* ring : response_rings_) {
            if (ring) {
                spsc_shm_close(ring);
            }
        }
        response_rings_.clear();

        // Close consumer
        if (consumer_) {
            mpsc_consumer_close(consumer_);
            consumer_ = nullptr;
        }

        // Clean up shared memory
        mpsc_unlink(base_name_.c_str(), max_clients_);
        for (size_t i = 0; i < max_clients_; i++) {
            std::string resp_name = base_name_ + "_response_" + std::to_string(i);
            spsc_shm_unlink(resp_name.c_str());
        }
        std::string id_name = base_name_ + "_next_id";
        shm_unlink(id_name.c_str());
    }

  private:
    std::string base_name_;
    size_t max_clients_;
    size_t ring_size_;
    struct mpsc_consumer* consumer_ = nullptr;
    std::vector<struct spsc_shm*> response_rings_;
};

} // namespace bb::ipc
