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
 */
struct alignas(64) MpscDoorbell {
    std::atomic<uint32_t> seq;
    std::array<uint8_t, 60> _pad; // Cache line alignment
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
     * @param spin_ns Nanoseconds to busy-wait before sleeping on doorbell
     * @return Ring index with data, or -1 on timeout
     */
    int wait_for_data(uint32_t spin_ns);

    /**
     * @brief Peek data from specific ring
     * @param ring_idx Ring index
     * @param n Output: bytes available
     * @return Pointer to data, or nullptr if empty
     */
    void* peek(size_t ring_idx, size_t* n);

    /**
     * @brief Release data from specific ring
     * @param ring_idx Ring index
     * @param n Bytes to release
     */
    void release(size_t ring_idx, size_t n);

  private:
    MpscConsumer(std::vector<SpscShm>&& rings, int doorbell_fd, size_t doorbell_len, MpscDoorbell* doorbell);

    std::vector<SpscShm> rings_;
    int doorbell_fd_ = -1;
    size_t doorbell_len_ = 0;
    MpscDoorbell* doorbell_ = nullptr;
    size_t last_served_ = 0; // Round-robin fairness
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
     * @param granted Output: bytes actually granted
     * @return Pointer to buffer, or nullptr if no space
     */
    void* claim(size_t want, size_t* granted);

    /**
     * @brief Publish data to producer's ring (rings doorbell)
     * @param n Bytes to publish
     */
    void publish(size_t n);

    /**
     * @brief Wait for space in producer's ring
     * @param need Bytes needed
     * @param spin_ns Nanoseconds to spin before sleeping
     * @return true if space available
     */
    bool wait_for_space(size_t need, uint32_t spin_ns);

  private:
    MpscProducer(SpscShm&& ring, int doorbell_fd, size_t doorbell_len, MpscDoorbell* doorbell, size_t producer_id);

    SpscShm ring_;
    int doorbell_fd_ = -1;
    size_t doorbell_len_ = 0;
    MpscDoorbell* doorbell_ = nullptr;
    size_t producer_id_ = 0;
};

} // namespace bb::ipc
