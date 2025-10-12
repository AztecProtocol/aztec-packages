#pragma once

#include "barretenberg/ipc/ipc_client.hpp"
#include "barretenberg/ipc/shm/mpsc_shm.h"
#include "barretenberg/ipc/shm/spsc_shm.h"
#include <atomic>
#include <cstring>
#include <fcntl.h>
#include <string>
#include <sys/mman.h>
#include <unistd.h>

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

    ~ShmClient() override { close(); }

    bool connect() override
    {
        if (producer_) {
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

        // Connect as MPSC producer for requests
        producer_ = mpsc_producer_connect(base_name_.c_str(), client_id_);
        if (!producer_) {
            return false;
        }

        // Connect to dedicated SPSC response ring
        std::string resp_name = base_name_ + "_response_" + std::to_string(client_id_);
        response_ring_ = spsc_shm_connect(resp_name.c_str());
        if (!response_ring_) {
            mpsc_producer_close(producer_);
            producer_ = nullptr;
            return false;
        }

        return true;
    }

    bool send(const void* data, size_t len, uint64_t timeout_ns) override
    {
        if (!producer_) {
            return false;
        }

        // Add 4-byte length prefix to match socket behavior
        size_t total_len = sizeof(uint32_t) + len;
        uint64_t timeout_us = timeout_ns > 0 ? timeout_ns / 1000 : 1000000000; // Default 1s

        if (!mpsc_wait_for_space(producer_, total_len, static_cast<uint32_t>(timeout_us))) {
            return false;
        }

        size_t granted = 0;
        void* buf = mpsc_claim(producer_, total_len, &granted);
        if (granted < total_len) {
            return false;
        }

        // Write length prefix then data
        auto len_u32 = static_cast<uint32_t>(len);
        std::memcpy(buf, &len_u32, sizeof(uint32_t));
        std::memcpy(static_cast<uint8_t*>(buf) + sizeof(uint32_t), data, len);
        mpsc_publish(producer_, total_len);

        return true;
    }

    ssize_t recv(void* buffer, size_t max_len, uint64_t timeout_ns) override
    {
        if (!response_ring_) {
            return -1;
        }

        uint64_t timeout_us = timeout_ns > 0 ? timeout_ns / 1000 : 1000000000; // Default 1s

        if (!spsc_wait_for_data(response_ring_, static_cast<uint32_t>(timeout_us))) {
            return -1;
        }

        size_t n = 0;
        void* data = spsc_peek(response_ring_, &n);
        if (!data || n < sizeof(uint32_t)) {
            if (n > 0) {
                spsc_release(response_ring_, n);
            }
            return -1;
        }

        // Read length prefix
        uint32_t msg_len = 0;
        std::memcpy(&msg_len, data, sizeof(uint32_t));

        if (n < sizeof(uint32_t) + msg_len) {
            spsc_release(response_ring_, n);
            return -1; // Incomplete message
        }

        if (msg_len > max_len) {
            spsc_release(response_ring_, n);
            return -1; // Buffer too small
        }

        // Copy message data (skip length prefix)
        std::memcpy(buffer, static_cast<const uint8_t*>(data) + sizeof(uint32_t), msg_len);
        spsc_release(response_ring_, sizeof(uint32_t) + msg_len);

        return static_cast<ssize_t>(msg_len);
    }

    void close() override
    {
        if (response_ring_) {
            spsc_shm_close(response_ring_);
            response_ring_ = nullptr;
        }

        if (producer_) {
            mpsc_producer_close(producer_);
            producer_ = nullptr;
        }
    }

  private:
    std::string base_name_;
    size_t max_clients_;
    uint32_t client_id_ = 0;
    struct mpsc_producer* producer_ = nullptr;
    struct spsc_shm* response_ring_ = nullptr;
};

} // namespace bb::ipc
