#pragma once

#include "ipc_server.hpp"
#include "shm/mpsc_shm.hpp"
#include "shm/spsc_shm.hpp"
#include "shm_common.hpp"
#include <cstdint>
#include <iostream>
#include <optional>
#include <string>
#include <utility>
#include <vector>

namespace ipc {

/**
 * @brief IPC server implementation using shared memory with multi-client support
 *
 * Uses MPSC (multi-producer single-consumer) for requests and per-client SPSC
 * rings for responses. Supports up to max_clients concurrent clients.
 *
 * Shared memory layout:
 * - Request: MPSC consumer with one SPSC ring per client (client writes, server reads)
 * - Response: Separate SPSC ring per client (server writes, client reads)
 */
class MpscShmServer : public IpcServer {
  public:
    MpscShmServer(std::string base_name,
                  size_t max_clients,
                  size_t request_ring_size = DEFAULT_RING_SIZE,
                  size_t response_ring_size = DEFAULT_RING_SIZE)
        : base_name_(std::move(base_name))
        , max_clients_(max_clients)
        , request_ring_size_(request_ring_size)
        , response_ring_size_(response_ring_size)
    {}

    ~MpscShmServer() override { close(); }

    // Non-copyable, non-movable
    MpscShmServer(const MpscShmServer&) = delete;
    MpscShmServer& operator=(const MpscShmServer&) = delete;
    MpscShmServer(MpscShmServer&&) = delete;
    MpscShmServer& operator=(MpscShmServer&&) = delete;

    bool listen() override
    {
        if (request_consumer_.has_value()) {
            return true; // Already listening
        }

        // Clean up any leftover shared memory
        MpscConsumer::unlink(base_name_ + "_req", max_clients_);
        for (size_t i = 0; i < max_clients_; i++) {
            SpscShm::unlink(base_name_ + "_resp_" + std::to_string(i));
        }

        try {
            // Create MPSC consumer for requests (one ring per client)
            request_consumer_ = MpscConsumer::create(base_name_ + "_req", max_clients_, request_ring_size_);

            // Create per-client SPSC response rings
            response_rings_.reserve(max_clients_);
            for (size_t i = 0; i < max_clients_; i++) {
                std::string resp_name = base_name_ + "_resp_" + std::to_string(i);
                response_rings_.push_back(SpscShm::create(resp_name, response_ring_size_));
            }

            return true;
        } catch (...) {
            close();
            return false;
        }
    }

    int wait_for_data(uint64_t timeout_ns) override
    {
        if (!request_consumer_.has_value()) {
            return -1;
        }
        // MpscConsumer::wait_for_data returns ring index = client_id
        return request_consumer_->wait_for_data(timeout_ns);
    }

    int wait_for_data_or_ready(uint64_t timeout_ns, const std::function<bool()>& also_ready) override
    {
        if (!request_consumer_.has_value()) {
            return -1;
        }
        // The predicate is evaluated inside the consumer's seq-latched window so
        // a completion posted (and notify()'d) just before the futex_wait is not
        // slept through. See MpscConsumer::wait_for_data / notify().
        return request_consumer_->wait_for_data(timeout_ns, also_ready);
    }

    void notify() override
    {
        if (request_consumer_.has_value()) {
            request_consumer_->notify();
        }
    }

    bool has_pending_request() override
    {
        // Side-effect-free ring scan — must not perturb the consumer's spin /
        // round-robin state, which a wait_for_data(0) peek would.
        return request_consumer_.has_value() && request_consumer_->has_data();
    }

    std::span<const uint8_t> receive(int client_id) override
    {
        if (!request_consumer_.has_value() || client_id < 0 || static_cast<size_t>(client_id) >= max_clients_) {
            return {};
        }
        // Peek on the specific client's request ring via MpscConsumer
        void* len_ptr = request_consumer_->peek(static_cast<size_t>(client_id), sizeof(uint32_t), 100000000);
        if (len_ptr == nullptr) {
            return {};
        }
        uint32_t msg_len = 0;
        std::memcpy(&msg_len, len_ptr, sizeof(uint32_t));

        // A prefix larger than the send side could legally publish means the
        // ring is corrupt — error out instead of waiting for it.
        if (msg_len > MAX_FRAME_SIZE || msg_len > request_ring_size_ / 2 - sizeof(uint32_t)) {
            throw std::runtime_error("MpscShmServer::receive: corrupt length prefix (" + std::to_string(msg_len) +
                                     " bytes exceeds ring/frame limits)");
        }

        void* msg_ptr = request_consumer_->peek(static_cast<size_t>(client_id), sizeof(uint32_t) + msg_len, 100000000);
        if (msg_ptr == nullptr) {
            return {};
        }
        if (deferred_release_) {
            // The caller will hold this view past the handler (zero-copy dispatch);
            // mask the ring so the reactor neither re-delivers nor spins on it until
            // release() unmasks.
            request_consumer_->set_masked(static_cast<size_t>(client_id), true);
        }
        return std::span<const uint8_t>(static_cast<const uint8_t*>(msg_ptr) + sizeof(uint32_t), msg_len);
    }

    void release(int client_id, size_t message_size) override
    {
        if (!request_consumer_.has_value() || client_id < 0 || static_cast<size_t>(client_id) >= max_clients_) {
            return;
        }
        request_consumer_->release(static_cast<size_t>(client_id), sizeof(uint32_t) + message_size);
        if (deferred_release_) {
            request_consumer_->set_masked(static_cast<size_t>(client_id), false);
        }
    }

    bool set_deferred_release(bool enabled) override
    {
        deferred_release_ = enabled;
        return true;
    }

    std::vector<std::pair<void*, size_t>> request_regions() override
    {
        return request_consumer_.has_value() ? request_consumer_->ring_regions()
                                             : std::vector<std::pair<void*, size_t>>{};
    }

    bool send(int client_id, const void* data, size_t len) override
    {
        if (client_id < 0 || static_cast<size_t>(client_id) >= response_rings_.size()) {
            return false;
        }
        return ring_send_msg(response_rings_[static_cast<size_t>(client_id)], data, len, 100000000);
    }

    void close() override
    {
        request_consumer_.reset();
        response_rings_.clear();

        // Clean up shared memory
        MpscConsumer::unlink(base_name_ + "_req", max_clients_);
        for (size_t i = 0; i < max_clients_; i++) {
            SpscShm::unlink(base_name_ + "_resp_" + std::to_string(i));
        }
    }

    void wakeup_all() override
    {
        if (request_consumer_.has_value()) {
            request_consumer_->wakeup_all();
        }
        for (auto& ring : response_rings_) {
            ring.wakeup_all();
        }
    }

    CleanupPaths cleanup_paths() const override
    {
        CleanupPaths paths;
        paths.shm_unlink_names.push_back(base_name_ + "_req_doorbell");
        for (size_t i = 0; i < max_clients_; i++) {
            paths.shm_unlink_names.push_back(base_name_ + "_req_ring_" + std::to_string(i));
            paths.shm_unlink_names.push_back(base_name_ + "_resp_" + std::to_string(i));
        }
        return paths;
    }

  private:
    std::string base_name_;
    size_t max_clients_;
    size_t request_ring_size_;
    size_t response_ring_size_;
    std::optional<MpscConsumer> request_consumer_;
    std::vector<SpscShm> response_rings_;
    bool deferred_release_ = false;
};

} // namespace ipc
