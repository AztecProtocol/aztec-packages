/**
 * @file mpsc_shm.hpp
 * @brief Multi-Producer Single-Consumer via SPSC rings + doorbell futex
 *
 * Coordinates multiple producers using individual SPSC rings and a shared doorbell.
 */

#pragma once

#include "spsc_shm.hpp"
#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace bb::ipc {

/**
 * @brief Shared doorbell for waking consumer
 *
 * Producers ring this when publishing data to wake the sleeping consumer.
 * Carefully aligned to avoid false sharing between producer and consumer.
 */
struct alignas(64) MpscDoorbell {
    // Producer-written (written by producers in publish())
    alignas(64) std::atomic<uint32_t> seq;
    std::array<uint8_t, 60> _pad0;

    // Consumer-written (written by consumer in wait_for_data())
    alignas(64) std::atomic<bool> consumer_blocked; // Set RIGHT BEFORE futex_wait, cleared RIGHT AFTER
    std::array<uint8_t, 63> _pad1;
};

/**
 * @brief Multi-producer single-consumer - consumer side
 *
 * Manages multiple SPSC rings (one per producer) and waits on a shared doorbell.
 */
class MpscConsumer {
  public:
    /**
     * @brief Create MPSC consumer
     * @param name Base name for shared memory objects
     * @param num_producers Number of producer rings to create
     * @param ring_capacity Capacity for each SPSC ring
     * @throws std::runtime_error if creation fails
     */
    static MpscConsumer create(const std::string& name, size_t num_producers, size_t ring_capacity);

    /**
     * @brief Unlink all shared memory for this MPSC system
     * @param name Base name
     * @param num_producers Number of producers
     * @return true if all unlinks successful
     */
    static bool unlink(const std::string& name, size_t num_producers);

    // Move-only
    MpscConsumer(MpscConsumer&& other) noexcept;
    MpscConsumer& operator=(MpscConsumer&& other) noexcept;
    MpscConsumer(const MpscConsumer&) = delete;
    MpscConsumer& operator=(const MpscConsumer&) = delete;

    ~MpscConsumer();

    /**
     * @brief Wait for data on any ring
     * @param timeout_ns Total timeout in nanoseconds (spins 10ms, then futex waits for remainder)
     * @return Ring index with data, or -1 on timeout
     */
    int wait_for_data(uint32_t timeout_ns);

    /**
     * @brief Peek data from specific ring
     * @param ring_idx Ring index
     * @param want Minimum bytes required
     * @param timeout_ns Timeout in nanoseconds
     * @return Pointer to data, or nullptr on timeout
     */
    void* peek(size_t ring_idx, size_t want, uint32_t timeout_ns);

    /**
     * @brief Release data from specific ring
     * @param ring_idx Ring index
     * @param n Bytes to release
     */
    void release(size_t ring_idx, size_t n);

    /**
     * @brief Wake all blocked threads (for graceful shutdown)
     * Wakes consumer blocked on doorbell and all producers blocked on their rings
     */
    void wakeup_all();

  private:
    MpscConsumer(std::vector<SpscShm>&& rings, int doorbell_fd, size_t doorbell_len, MpscDoorbell* doorbell);

    std::vector<SpscShm> rings_;
    int doorbell_fd_ = -1;
    size_t doorbell_len_ = 0;
    MpscDoorbell* doorbell_ = nullptr;
    size_t last_served_ = 0;         // Round-robin fairness
    bool previous_had_data_ = false; // Adaptive spinning: only spin if previous call found data
};

/**
 * @brief Multi-producer single-consumer - producer side
 *
 * Connects to one SPSC ring and rings the shared doorbell when publishing.
 */
class MpscProducer {
  public:
    /**
     * @brief Connect to MPSC system as a producer
     * @param name Base name for shared memory objects
     * @param producer_id Producer ID (determines which ring to use)
     * @throws std::runtime_error if connection fails
     */
    static MpscProducer connect(const std::string& name, size_t producer_id);

    // Move-only
    MpscProducer(MpscProducer&& other) noexcept;
    MpscProducer& operator=(MpscProducer&& other) noexcept;
    MpscProducer(const MpscProducer&) = delete;
    MpscProducer& operator=(const MpscProducer&) = delete;

    ~MpscProducer();

    /**
     * @brief Claim space in producer's ring
     * @param want Bytes wanted
     * @param timeout_ns Timeout in nanoseconds
     * @return Pointer to buffer, or nullptr on timeout
     */
    void* claim(size_t want, uint32_t timeout_ns);

    /**
     * @brief Publish data to producer's ring (rings doorbell)
     * @param n Bytes to publish
     */
    void publish(size_t n);

  private:
    MpscProducer(SpscShm&& ring, int doorbell_fd, size_t doorbell_len, MpscDoorbell* doorbell, size_t producer_id);

    SpscShm ring_;
    int doorbell_fd_ = -1;
    size_t doorbell_len_ = 0;
    MpscDoorbell* doorbell_ = nullptr;
    size_t producer_id_ = 0;
};

} // namespace bb::ipc
