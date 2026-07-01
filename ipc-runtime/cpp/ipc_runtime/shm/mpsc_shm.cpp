#include "mpsc_shm.hpp"
#include "futex.hpp"
#include "utilities.hpp"
#include <atomic>
#include <cerrno>
#include <climits>
#include <csignal>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <stdexcept>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>
#include <utility>
#include <vector>

namespace ipc {

// ----- MpscConsumer Implementation -----

MpscConsumer::MpscConsumer(std::vector<SpscShm>&& rings, int doorbell_fd, size_t doorbell_len, MpscDoorbell* doorbell)
    : rings_(std::move(rings))
    , doorbell_fd_(doorbell_fd)
    , doorbell_len_(doorbell_len)
    , doorbell_(doorbell)
{}

MpscConsumer::MpscConsumer(MpscConsumer&& other) noexcept
    : rings_(std::move(other.rings_))
    , doorbell_fd_(other.doorbell_fd_)
    , doorbell_len_(other.doorbell_len_)
    , doorbell_(other.doorbell_)
    , last_served_(other.last_served_)
{
    other.doorbell_fd_ = -1;
    other.doorbell_len_ = 0;
    other.doorbell_ = nullptr;
    other.last_served_ = 0;
}

MpscConsumer& MpscConsumer::operator=(MpscConsumer&& other) noexcept
{
    if (this != &other) {
        // Clean up current resources
        if (doorbell_ != nullptr) {
            munmap(doorbell_, doorbell_len_);
        }
        if (doorbell_fd_ >= 0) {
            ::close(doorbell_fd_);
        }

        // Move from other
        rings_ = std::move(other.rings_);
        doorbell_fd_ = other.doorbell_fd_;
        doorbell_len_ = other.doorbell_len_;
        doorbell_ = other.doorbell_;
        last_served_ = other.last_served_;

        // Clear other
        other.doorbell_fd_ = -1;
        other.doorbell_len_ = 0;
        other.doorbell_ = nullptr;
        other.last_served_ = 0;
    }
    return *this;
}

MpscConsumer::~MpscConsumer()
{
    if (doorbell_ != nullptr) {
        munmap(doorbell_, doorbell_len_);
    }
    if (doorbell_fd_ >= 0) {
        ::close(doorbell_fd_);
    }
}

MpscConsumer MpscConsumer::create(const std::string& name, size_t num_producers, size_t ring_capacity)
{
    if (name.empty() || num_producers == 0) {
        throw std::runtime_error("MpscConsumer::create: invalid arguments");
    }

    // Create doorbell shared memory
    std::string doorbell_name = name + "_doorbell";
    // The doorbell mapping also carries the per-slot owner table (one atomic per
    // producer), so clients can self-allocate a slot on connect.
    size_t doorbell_len = sizeof(MpscDoorbell) + num_producers * sizeof(std::atomic<uint32_t>);

    int doorbell_fd = shm_open(doorbell_name.c_str(), O_RDWR | O_CREAT | O_EXCL, 0600);
    if (doorbell_fd < 0) {
        throw std::runtime_error("MpscConsumer::create: shm_open doorbell failed: " +
                                 std::string(std::strerror(errno)));
    }

    if (ftruncate(doorbell_fd, static_cast<off_t>(doorbell_len)) != 0) {
        int e = errno;
        ::close(doorbell_fd);
        shm_unlink(doorbell_name.c_str());
        throw std::runtime_error("MpscConsumer::create: ftruncate doorbell failed: " + std::string(std::strerror(e)));
    }

    auto* doorbell =
        static_cast<MpscDoorbell*>(mmap(nullptr, doorbell_len, PROT_READ | PROT_WRITE, MAP_SHARED, doorbell_fd, 0));
    if (doorbell == MAP_FAILED) {
        int e = errno;
        ::close(doorbell_fd);
        shm_unlink(doorbell_name.c_str());
        throw std::runtime_error("MpscConsumer::create: mmap doorbell failed: " + std::string(std::strerror(e)));
    }

    // Initialize doorbell (use placement new to avoid memset on non-trivial type)
    new (doorbell) MpscDoorbell{};
    doorbell->seq.store(0, std::memory_order_release);
    doorbell->num_slots.store(static_cast<uint32_t>(num_producers), std::memory_order_release);
    // Initialize the per-slot owner table to "free" (pid 0).
    std::atomic<uint32_t>* slot_owners = mpsc_slot_owners(doorbell);
    for (size_t i = 0; i < num_producers; i++) {
        new (&slot_owners[i]) std::atomic<uint32_t>(0);
    }

    // Create all SPSC rings
    std::vector<SpscShm> rings;
    rings.reserve(num_producers);

    try {
        for (size_t i = 0; i < num_producers; i++) {
            std::string ring_name = name + "_ring_" + std::to_string(i);
            rings.push_back(SpscShm::create(ring_name, ring_capacity));
        }
    } catch (...) {
        // Cleanup on failure
        for (size_t i = 0; i < rings.size(); i++) {
            std::string ring_name = name + "_ring_" + std::to_string(i);
            SpscShm::unlink(ring_name);
        }
        munmap(doorbell, doorbell_len);
        ::close(doorbell_fd);
        shm_unlink(doorbell_name.c_str());
        throw;
    }

    return MpscConsumer(std::move(rings), doorbell_fd, doorbell_len, doorbell);
}

bool MpscConsumer::unlink(const std::string& name, size_t num_producers)
{
    std::string doorbell_name = name + "_doorbell";
    shm_unlink(doorbell_name.c_str());

    for (size_t i = 0; i < num_producers; i++) {
        std::string ring_name = name + "_ring_" + std::to_string(i);
        SpscShm::unlink(ring_name);
    }

    return true;
}

int MpscConsumer::wait_for_data(uint64_t timeout_ns, const std::function<bool()>& also_ready)
{
    size_t num_rings = rings_.size();

    // Phase 1: Quick poll - check if data already available
    for (size_t i = 0; i < num_rings; i++) {
        size_t idx = (last_served_ + 1 + i) % num_rings;
        if (rings_[idx].available() > 0) {
            last_served_ = idx;
            previous_had_data_ = true; // Found data - enable spinning on next call
            return static_cast<int>(idx);
        }
    }

    // No ring data, but the caller may already have a completion to drain — don't
    // spin or block in that case.
    if (also_ready && also_ready()) {
        return -1;
    }

    // Adaptive spinning: only spin if previous call found data
    constexpr uint64_t SPIN_NS = 100000; // 100us
    uint64_t spin_duration;
    uint64_t remaining_timeout;

    if (previous_had_data_) {
        // Previous call found data - do full spin (optimistic)
        spin_duration = (timeout_ns < SPIN_NS) ? timeout_ns : SPIN_NS;
        remaining_timeout = (timeout_ns > SPIN_NS) ? (timeout_ns - SPIN_NS) : 0;
    } else {
        // Previous call timed out - skip spinning (idle channel)
        spin_duration = 0;
        remaining_timeout = timeout_ns;
    }

    // Phase 2: Spin phase (only if previous call found data)
    if (spin_duration > 0) {
        uint64_t start = mono_ns_now();
        // notify() (a completion wake) bumps the doorbell seq but adds no ring
        // data, so the ring scan below would spin right through it. Watch the seq
        // too: any change (a publish OR a notify) breaks the spin so the
        // post-spin predicate check runs promptly — without this, every
        // low-concurrency request eats the full spin before its response is sent.
        uint32_t spin_seq = doorbell_->seq.load(std::memory_order_acquire);
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-do-while)
        do {
            for (size_t i = 0; i < num_rings; i++) {
                size_t idx = (last_served_ + 1 + i) % num_rings;
                if (rings_[idx].available() > 0) {
                    last_served_ = idx;
                    previous_had_data_ = true; // Found data during spin
                    return static_cast<int>(idx);
                }
            }
            if (also_ready && doorbell_->seq.load(std::memory_order_acquire) != spin_seq) {
                break; // a completion may be ready — fall through to the predicate check
            }
            IPC_PAUSE();
        } while ((mono_ns_now() - start) < spin_duration);

        // Check after spin
        for (size_t i = 0; i < num_rings; i++) {
            size_t idx = (last_served_ + 1 + i) % num_rings;
            if (rings_[idx].available() > 0) {
                last_served_ = idx;
                previous_had_data_ = true; // Found data after spin
                return static_cast<int>(idx);
            }
        }
    }

    // No more time or didn't spin - check if we can block
    if (remaining_timeout == 0) {
        previous_had_data_ = false; // Timeout - disable spinning on next call
        return -1;
    }

    // About to block. Capture the doorbell seq and arm the futex against it.
    // Producers bump seq on every publish and wake unconditionally (see
    // MpscProducer::publish), and futex_wait re-checks *seq == seq atomically, so
    // a publish that lands before we sleep returns EAGAIN. The arm-value plus the
    // unconditional wake are the whole protocol — no "blocked" flag.
    uint32_t seq = doorbell_->seq.load(std::memory_order_acquire);

    // Final check before blocking
    for (size_t i = 0; i < num_rings; i++) {
        size_t idx = (last_served_ + 1 + i) % num_rings;
        if (rings_[idx].available() > 0) {
            last_served_ = idx;
            previous_had_data_ = true; // Found data before blocking
            return static_cast<int>(idx);
        }
    }

    // Same arm-value protocol, extended to the completion predicate: notify()
    // bumps the doorbell seq we latched above, so a completion posted between
    // this check and the futex_wait returns EAGAIN rather than sleeping; one
    // posted before this check is caught right here.
    if (also_ready && also_ready()) {
        previous_had_data_ = false;
        return -1;
    }

    futex_wait_timeout(reinterpret_cast<volatile uint32_t*>(&doorbell_->seq), seq, remaining_timeout);

    // After waking, poll again
    for (size_t i = 0; i < num_rings; i++) {
        size_t idx = (last_served_ + 1 + i) % num_rings;
        if (rings_[idx].available() > 0) {
            last_served_ = idx;
            previous_had_data_ = true; // Found data after waking
            return static_cast<int>(idx);
        }
    }

    previous_had_data_ = false; // Timeout - disable spinning on next call
    return -1;                  // No data available (timeout)
}

void* MpscConsumer::peek(size_t ring_idx, size_t want, uint64_t timeout_ns)
{
    if (ring_idx >= rings_.size()) {
        return nullptr;
    }
    return rings_[ring_idx].peek(want, timeout_ns);
}

void MpscConsumer::release(size_t ring_idx, size_t n)
{
    if (ring_idx < rings_.size()) {
        rings_[ring_idx].release(n);
    }
}

void MpscConsumer::wakeup_all()
{
    // Wake consumer blocked on doorbell
    futex_wake(reinterpret_cast<volatile uint32_t*>(&doorbell_->seq), INT_MAX);

    // Wake all producers blocked on their rings
    for (auto& ring : rings_) {
        ring.wakeup_all();
    }
}

bool MpscConsumer::has_data() const
{
    for (const auto& ring : rings_) {
        if (ring.available() > 0) {
            return true;
        }
    }
    return false;
}

void MpscConsumer::notify()
{
    // Mirror MpscProducer::publish's doorbell ring: bump seq (release) BEFORE the
    // wake so a consumer that armed its futex against the old value sees the
    // change and returns instead of sleeping. wakeup_all's bare futex_wake is not
    // enough here — without a seq bump a wake landing in the consumer's pre-sleep
    // window is lost.
    doorbell_->seq.fetch_add(1, std::memory_order_release);
    futex_wake(reinterpret_cast<volatile uint32_t*>(&doorbell_->seq), 1);
}

// ----- MpscProducer Implementation -----

MpscProducer::MpscProducer(
    SpscShm&& ring, int doorbell_fd, size_t doorbell_len, MpscDoorbell* doorbell, size_t producer_id)
    : ring_(std::move(ring))
    , doorbell_fd_(doorbell_fd)
    , doorbell_len_(doorbell_len)
    , doorbell_(doorbell)
    , producer_id_(producer_id)
{}

MpscProducer::MpscProducer(MpscProducer&& other) noexcept
    : ring_(std::move(other.ring_))
    , doorbell_fd_(other.doorbell_fd_)
    , doorbell_len_(other.doorbell_len_)
    , doorbell_(other.doorbell_)
    , producer_id_(other.producer_id_)
{
    other.doorbell_fd_ = -1;
    other.doorbell_len_ = 0;
    other.doorbell_ = nullptr;
    other.producer_id_ = 0;
}

MpscProducer& MpscProducer::operator=(MpscProducer&& other) noexcept
{
    if (this != &other) {
        // Clean up current resources
        if (doorbell_ != nullptr) {
            munmap(doorbell_, doorbell_len_);
        }
        if (doorbell_fd_ >= 0) {
            ::close(doorbell_fd_);
        }

        // Move from other
        ring_ = std::move(other.ring_);
        doorbell_fd_ = other.doorbell_fd_;
        doorbell_len_ = other.doorbell_len_;
        doorbell_ = other.doorbell_;
        producer_id_ = other.producer_id_;

        // Clear other
        other.doorbell_fd_ = -1;
        other.doorbell_len_ = 0;
        other.doorbell_ = nullptr;
        other.producer_id_ = 0;
    }
    return *this;
}

MpscProducer::~MpscProducer()
{
    if (doorbell_ != nullptr) {
        munmap(doorbell_, doorbell_len_);
    }
    if (doorbell_fd_ >= 0) {
        ::close(doorbell_fd_);
    }
}

MpscProducer MpscProducer::connect(const std::string& name, size_t producer_id)
{
    if (name.empty()) {
        throw std::runtime_error("MpscProducer::connect: empty name");
    }

    // Connect to doorbell
    std::string doorbell_name = name + "_doorbell";
    size_t doorbell_len = sizeof(MpscDoorbell);

    int doorbell_fd = shm_open(doorbell_name.c_str(), O_RDWR, 0600);
    if (doorbell_fd < 0) {
        throw std::runtime_error("MpscProducer::connect: shm_open doorbell failed: " +
                                 std::string(std::strerror(errno)));
    }

    auto* doorbell =
        static_cast<MpscDoorbell*>(mmap(nullptr, doorbell_len, PROT_READ | PROT_WRITE, MAP_SHARED, doorbell_fd, 0));
    if (doorbell == MAP_FAILED) {
        int e = errno;
        ::close(doorbell_fd);
        throw std::runtime_error("MpscProducer::connect: mmap doorbell failed: " + std::string(std::strerror(e)));
    }

    // Connect to assigned ring
    std::string ring_name = name + "_ring_" + std::to_string(producer_id);
    try {
        SpscShm ring = SpscShm::connect(ring_name);
        return MpscProducer(std::move(ring), doorbell_fd, doorbell_len, doorbell, producer_id);
    } catch (...) {
        munmap(doorbell, doorbell_len);
        ::close(doorbell_fd);
        throw;
    }
}

void* MpscProducer::claim(size_t want, uint64_t timeout_ns)
{
    return ring_.claim(want, timeout_ns);
}

void MpscProducer::publish(size_t n)
{
    // Publish to ring first
    ring_.publish(n);

    // Ring doorbell to wake the consumer. Bump seq (release) so a consumer
    // mid-block sees the value change and its futex_wait returns immediately,
    // then wake unconditionally — never gated on a "consumer blocked" flag (see
    // SpscShm::publish for why that handshake is unsafe across processes).
    doorbell_->seq.fetch_add(1, std::memory_order_release);
    futex_wake(reinterpret_cast<volatile uint32_t*>(&doorbell_->seq), 1);
}

// ----- MpscSlotClaim Implementation -----

namespace {
// True if `pid` refers to a live process we could in principle signal. Only a
// definitive ESRCH (no such process) is treated as dead, so a slot owned by a
// live-but-unsignalable process (EPERM) is never wrongly reclaimed.
bool pid_alive(uint32_t pid)
{
    if (pid == 0) {
        return false;
    }
    return ::kill(static_cast<pid_t>(pid), 0) == 0 || errno != ESRCH;
}
} // namespace

MpscSlotClaim MpscSlotClaim::claim(const std::string& name)
{
    std::string doorbell_name = name + "_doorbell";
    int fd = shm_open(doorbell_name.c_str(), O_RDWR, 0600);
    if (fd < 0) {
        throw std::runtime_error("MpscSlotClaim::claim: shm_open doorbell failed (server not listening?): " +
                                 std::string(std::strerror(errno)));
    }

    struct stat st{};
    if (fstat(fd, &st) != 0 || static_cast<size_t>(st.st_size) < sizeof(MpscDoorbell)) {
        int e = errno;
        ::close(fd);
        throw std::runtime_error("MpscSlotClaim::claim: fstat doorbell failed: " + std::string(std::strerror(e)));
    }
    size_t len = static_cast<size_t>(st.st_size);

    auto* doorbell = static_cast<MpscDoorbell*>(mmap(nullptr, len, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0));
    if (doorbell == MAP_FAILED) {
        int e = errno;
        ::close(fd);
        throw std::runtime_error("MpscSlotClaim::claim: mmap doorbell failed: " + std::string(std::strerror(e)));
    }

    size_t num_slots = doorbell->num_slots.load(std::memory_order_acquire);
    std::atomic<uint32_t>* owners = mpsc_slot_owners(doorbell);
    auto my_pid = static_cast<uint32_t>(getpid());

    // A couple of passes absorbs transient CAS contention between concurrent
    // claimants before declaring the server full.
    for (int pass = 0; pass < 3; pass++) {
        for (size_t i = 0; i < num_slots; i++) {
            uint32_t owner = owners[i].load(std::memory_order_acquire);
            if (owner != 0 && pid_alive(owner)) {
                continue; // owned by a live client
            }
            // Free, or owned by a dead process — try to take it.
            if (owners[i].compare_exchange_strong(owner, my_pid, std::memory_order_acq_rel)) {
                return MpscSlotClaim(fd, doorbell, len, i);
            }
            // Lost the race for this slot; keep scanning.
        }
    }

    munmap(doorbell, len);
    ::close(fd);
    throw std::runtime_error("MpscSlotClaim::claim: no free slot (all " + std::to_string(num_slots) +
                             " producer slots in use)");
}

MpscSlotClaim::MpscSlotClaim(MpscSlotClaim&& other) noexcept
    : fd_(other.fd_)
    , map_(other.map_)
    , len_(other.len_)
    , id_(other.id_)
{
    other.fd_ = -1;
    other.map_ = nullptr;
    other.len_ = 0;
}

MpscSlotClaim& MpscSlotClaim::operator=(MpscSlotClaim&& other) noexcept
{
    if (this != &other) {
        this->~MpscSlotClaim();
        fd_ = other.fd_;
        map_ = other.map_;
        len_ = other.len_;
        id_ = other.id_;
        other.fd_ = -1;
        other.map_ = nullptr;
        other.len_ = 0;
    }
    return *this;
}

MpscSlotClaim::~MpscSlotClaim()
{
    if (map_ != nullptr) {
        // Release the slot so another client (or a reconnect) can take it.
        std::atomic<uint32_t>* owners = mpsc_slot_owners(static_cast<MpscDoorbell*>(map_));
        owners[id_].store(0, std::memory_order_release);
        munmap(map_, len_);
        map_ = nullptr;
    }
    if (fd_ >= 0) {
        ::close(fd_);
        fd_ = -1;
    }
}

} // namespace ipc
