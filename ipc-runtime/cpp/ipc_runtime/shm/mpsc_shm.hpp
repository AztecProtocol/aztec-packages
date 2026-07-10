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
#include <functional>
#include <memory>
#include <string>
#include <vector>

namespace ipc {

/**
 * @brief Shared doorbell for waking consumer
 *
 * Producers ring this when publishing data to wake the sleeping consumer.
 * Carefully aligned to avoid false sharing between producer and consumer.
 */
struct alignas(64) MpscDoorbell {
    // Producer-written (written by producers in publish()). Consumers wait on
    // this seq with a futex; producers bump it and wake unconditionally.
    alignas(64) std::atomic<uint32_t> seq;
    // Number of producer slots (= num_producers). Written once by the consumer at
    // create(); read by clients to bound the slot-claim scan. Kept here (offset 4)
    // so `seq` stays at offset 0 and the doorbell mapping/wakeup path is unchanged.
    std::atomic<uint32_t> num_slots;
    std::array<uint8_t, 56> _pad0;
};
static_assert(sizeof(MpscDoorbell) == 64, "MpscDoorbell layout must stay 64 bytes (seq at offset 0)");

// The per-slot owner table follows the doorbell in the same shared mapping: one
// std::atomic<uint32_t> per producer slot, holding the owning client's pid (0 =
// free). Clients claim a slot here on connect (see MpscSlotClaim); the consumer
// never reads it (it just round-robin-polls all rings). Total mapping size is
// sizeof(MpscDoorbell) + num_slots * sizeof(std::atomic<uint32_t>).
inline std::atomic<uint32_t>* mpsc_slot_owners(MpscDoorbell* doorbell)
{
    return reinterpret_cast<std::atomic<uint32_t>*>(reinterpret_cast<char*>(doorbell) + sizeof(MpscDoorbell));
}

/**
 * @brief RAII claim on a free producer slot, taken by a client on connect.
 *
 * Maps the MPSC doorbell region and atomically claims the lowest-indexed slot
 * that is free, or owned by a dead process (reclaimed). The claimed index is the
 * client's producer/response ring id. The slot is released (set free) on
 * destruction. This is what makes connect() self-allocating: callers no longer
 * have to coordinate unique client ids out of band (the previous default of 0
 * silently aliased every client onto one ring pair).
 *
 * Dead-owner reclaim uses kill(pid, 0); a crashed client can't run its own
 * release, so its slot is reclaimed by the next claimant. This only prevents
 * live clients from aliasing onto one slot; it does not guarantee recovery from
 * stale in-flight requests left by a crashed owner.
 */
class MpscSlotClaim {
  public:
    // Claim a slot on `name`'s doorbell (`name` is the MPSC base, e.g. "<path>_req").
    // Throws std::runtime_error if the doorbell is absent (server not up) or full.
    static MpscSlotClaim claim(const std::string& name);

    MpscSlotClaim(MpscSlotClaim&& other) noexcept;
    MpscSlotClaim& operator=(MpscSlotClaim&& other) noexcept;
    MpscSlotClaim(const MpscSlotClaim&) = delete;
    MpscSlotClaim& operator=(const MpscSlotClaim&) = delete;
    ~MpscSlotClaim();

    size_t id() const { return id_; }

  private:
    MpscSlotClaim(int fd, void* map, size_t len, size_t id)
        : fd_(fd)
        , map_(map)
        , len_(len)
        , id_(id)
    {}

    int fd_ = -1;
    void* map_ = nullptr;
    size_t len_ = 0;
    size_t id_ = 0;
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
     * @brief Mask/unmask a ring for the data-scan (wait_for_data/has_data).
     *
     * A masked ring is skipped even if it holds unconsumed bytes. Used for
     * deferred-release dispatch: while a request's ring region is held by a
     * worker (zero-copy view), the reactor must neither re-deliver that message
     * nor spin on the ring. Set from the reactor thread, cleared from the
     * releasing thread; atomic per ring.
     */
    void set_masked(size_t ring_index, bool masked);

    /**
     * @brief Wait for data on any ring
     * @param timeout_ns Total timeout in nanoseconds (spins 10ms, then futex waits for remainder)
     * @param also_ready Optional predicate; if it returns true the wait returns
     *        early with -1 (no ring data, but the caller has other work). It is
     *        evaluated inside the same doorbell-seq-latched window as the final
     *        ring scan, so a notify() that bumps the doorbell seq just before the
     *        futex_wait cannot be slept through.
     * @return Ring index with data, or -1 on timeout / early predicate wake
     */
    int wait_for_data(uint64_t timeout_ns, const std::function<bool()>& also_ready = {});

    /**
     * @brief Non-blocking, side-effect-free check for any ring with data.
     *
     * Unlike wait_for_data(0) this does NOT touch the round-robin cursor or the
     * adaptive-spin state, so it is safe to call as a frequent "is more pending?"
     * peek without degrading the next real wait.
     */
    bool has_data() const;

    /**
     * @brief Wake the consumer blocked in wait_for_data, without delivering ring
     * data.
     *
     * Bumps the doorbell seq (release) then futex_wakes it — identical to the
     * doorbell ring in MpscProducer::publish. The seq bump is what makes a
     * consumer that is mid-wait see a value change and return from futex_wait
     * instead of sleeping; a bare futex_wake (as in wakeup_all) would race.
     */
    void notify();

    /**
     * @brief Peek data from specific ring
     * @param ring_idx Ring index
     * @param want Minimum bytes required
     * @param timeout_ns Timeout in nanoseconds
     * @return Pointer to data, or nullptr on timeout
     */
    void* peek(size_t ring_idx, size_t want, uint64_t timeout_ns);

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

    std::unique_ptr<std::atomic<bool>[]> masked_;

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
    void* claim(size_t want, uint64_t timeout_ns);

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

} // namespace ipc
