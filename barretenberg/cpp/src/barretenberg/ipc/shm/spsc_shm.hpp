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

    // Futex sequencers (increment on empty→nonempty and full→has-space)
    alignas(SPSC_CACHELINE) std::atomic<uint32_t> data_seq;
    alignas(SPSC_CACHELINE) std::atomic<uint32_t> space_seq;
    std::array<char, SPSC_CACHELINE - (sizeof(data_seq) + sizeof(space_seq))> _pad2;

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
    uint64_t available() const;  // bytes ready to read
    uint64_t free_space() const; // bytes free to write

    // Producer API
    void* claim(size_t want, size_t* granted); // claim contiguous space (may wrap)
    void publish(size_t n);                    // publish n bytes

    // Consumer API
    void* peek(size_t* n);  // peek contiguous readable region (skips padding)
    void release(size_t n); // release n bytes

    // Adaptive wait (spin for spin_ns, then futex sleep)
    bool wait_for_data(uint32_t spin_ns);               // returns true if data available
    bool wait_for_space(size_t need, uint32_t spin_ns); // returns true if space available

    // Wake all blocked threads (for graceful shutdown)
    void wakeup_all();

  private:
    // Private constructor for create/connect factories
    SpscShm(int fd, size_t map_len, SpscCtrl* ctrl, uint8_t* buf);

    int fd_ = -1;
    size_t map_len_ = 0;
    SpscCtrl* ctrl_ = nullptr;
    uint8_t* buf_ = nullptr;
};

} // namespace bb::ipc
