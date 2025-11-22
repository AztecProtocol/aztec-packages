/**
 * @file spsc_shm.hpp
 * @brief Single-producer/single-consumer shared-memory ring buffer (Linux, x86-64 optimized)
 *
 * - Zero-copy between processes via MAP_SHARED
 * - One producer, one consumer. No locks. Hot path has no syscalls
 * - Adaptive spin, then futex sleep/wake on empty/full transitions
 * - Variable-length message framing
 */

#pragma once

#include <array>
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string>

namespace bb::ipc {

constexpr size_t SPSC_CACHELINE = 64;

/**
 * @brief Control structure for SPSC ring buffer
 *
 * Carefully aligned to avoid false sharing between producer and consumer.
 */
struct alignas(SPSC_CACHELINE) SpscCtrl {
    // Producer-owned (written by producer, read by consumer)
    alignas(SPSC_CACHELINE) std::atomic<uint64_t> head; // bytes written
    std::array<char, SPSC_CACHELINE - sizeof(head)> _pad0;

    // Consumer-owned (written by consumer, read by producer)
    alignas(SPSC_CACHELINE) std::atomic<uint64_t> tail; // bytes consumed
    std::array<char, SPSC_CACHELINE - sizeof(tail)> _pad1;

    // Producer-owned sequencer and flag (written by producer in publish())
    alignas(SPSC_CACHELINE) std::atomic<uint32_t> data_seq;
    std::atomic<bool> producer_blocked; // Written by producer in wait_for_space()
    std::array<char, SPSC_CACHELINE - sizeof(data_seq) - sizeof(producer_blocked)> _pad2;

    // Consumer-owned sequencer and flag (written by consumer)
    alignas(SPSC_CACHELINE) std::atomic<uint32_t> space_seq;
    std::atomic<bool> consumer_blocked; // Written by consumer in wait_for_data()
    std::array<char, SPSC_CACHELINE - sizeof(space_seq) - sizeof(consumer_blocked)> _pad3;

    // Immutable capacity information
    alignas(SPSC_CACHELINE) uint64_t capacity; // power of two
    alignas(SPSC_CACHELINE) uint64_t mask;     // capacity - 1

    // uint8_t buffer[capacity] follows in memory...
};

static_assert(alignof(SpscCtrl) == SPSC_CACHELINE, "SpscCtrl alignment");
static_assert(sizeof(SpscCtrl) % SPSC_CACHELINE == 0, "SpscCtrl size multiple of cache line");

/**
 * @brief Lock-free single-producer single-consumer shared memory ring buffer
 *
 * Provides zero-copy message passing between processes using shared memory.
 * Uses futex for efficient blocking when empty/full.
 *
 * CRITICAL USAGE REQUIREMENT:
 * Each claim(n)/publish(n) pair by the producer MUST be perfectly matched by a corresponding
 * peek(n)/release(n) pair by the consumer, with the EXACT same sizes.
 *
 * This is because the wrapping logic is completely stateless - it decides whether to wrap based
 * solely on whether the requested size fits in the remaining space before the end of the buffer.
 * If the producer and consumer use different sizes, they will make inconsistent wrap decisions
 * and data corruption will occur.
 *
 * CORRECT usage example (framed messages):
 *   Producer:                               Consumer:
 *   claim(4), publish(4)             <--->  peek(4), release(4)              // length prefix
 *   claim(msg_len), publish(msg_len) <--->  peek(msg_len), release(msg_len)  // message data
 */
class SpscShm {
  public:
    /**
     * @brief Create a new SPSC ring buffer
     * @param name Shared memory object name (without /dev/shm prefix)
     * @param min_capacity Minimum capacity (rounded up to power of 2)
     * @throws std::runtime_error if creation fails
     */
    static SpscShm create(const std::string& name, size_t min_capacity);

    /**
     * @brief Connect to existing SPSC ring buffer
     * @param name Shared memory object name
     * @throws std::runtime_error if connection fails
     */
    static SpscShm connect(const std::string& name);

    /**
     * @brief Unlink shared memory object (cleanup after close)
     * @param name Shared memory object name
     * @return true if successful, false otherwise
     */
    static bool unlink(const std::string& name);

    // Move-only (no copy)
    SpscShm(SpscShm&& other) noexcept;
    SpscShm& operator=(SpscShm&& other) noexcept;
    SpscShm(const SpscShm&) = delete;
    SpscShm& operator=(const SpscShm&) = delete;

    ~SpscShm();

    // Introspection
    uint64_t available() const; // bytes ready to read

    /**
     * Producer API: claim() and publish() must be used in pairs
     *
     * @brief Claim contiguous space in the ring buffer (blocks until available)
     * @param want Number of bytes to claim
     * @param timeout_ns Timeout in nanoseconds
     * @return Pointer to claimed space, or nullptr on timeout
     *
     * IMPORTANT: The size passed to claim(want) must exactly match the size passed to the
     * corresponding peek(want) call by the consumer. Otherwise wrap decisions will be inconsistent.
     */
    void* claim(size_t want, uint32_t timeout_ns);

    /**
     * @brief Publish n bytes previously claimed
     * @param n Number of bytes to publish (must match what was claimed)
     *
     * IMPORTANT: The size passed to publish(n) must exactly match the size passed to the
     * corresponding release(n) call by the consumer. Otherwise wrap decisions will be inconsistent.
     */
    void publish(size_t n);

    /**
     * Consumer API: peek() and release() must be used in pairs
     *
     * @brief Peek contiguous readable region (blocks until available)
     * @param want Number of bytes to peek
     * @param timeout_ns Timeout in nanoseconds
     * @return Pointer to readable data, or nullptr on timeout
     *
     * IMPORTANT: The size passed to peek(want) must exactly match the size passed to the
     * corresponding claim(want) call by the producer. Otherwise wrap decisions will be inconsistent.
     */
    void* peek(size_t want, uint32_t timeout_ns);

    /**
     * @brief Release n bytes previously peeked
     * @param n Number of bytes to release (must match what was peeked)
     *
     * IMPORTANT: The size passed to release(n) must exactly match the size passed to the
     * corresponding publish(n) call by the producer. Otherwise wrap decisions will be inconsistent.
     */
    void release(size_t n);

    /**
     * @brief Wake all blocked threads (for graceful shutdown)
     *
     * Wakes both producers blocked on space and consumers blocked on data.
     * Used for graceful shutdown of the communication channel.
     */
    void wakeup_all();

  private:
    // Private constructor for create/connect factories
    SpscShm(int fd, size_t map_len, SpscCtrl* ctrl, uint8_t* buf);

    // Internal helpers
    uint64_t free_space() const;                        // bytes free to write
    bool wait_for_data(size_t need, uint32_t spin_ns);  // returns true if data available
    bool wait_for_space(size_t need, uint32_t spin_ns); // returns true if space available

    int fd_ = -1;
    size_t map_len_ = 0;
    SpscCtrl* ctrl_ = nullptr;
    uint8_t* buf_ = nullptr;
    bool previous_had_data_ = false;  // Adaptive spinning: consumer only spins if previous call found data
    bool previous_had_space_ = false; // Adaptive spinning: producer only spins if previous call found space
};

} // namespace bb::ipc
