#include "barretenberg/ipc/shm/mpsc_shm.hpp"
#include <atomic>
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <linux/futex.h>
#include <stdexcept>
#include <string>
#include <sys/mman.h>
#include <sys/syscall.h>
#include <time.h> // NOLINT(modernize-deprecated-headers) - need POSIX clock_gettime/CLOCK_MONOTONIC
#include <unistd.h>
#include <utility>
#include <vector>

#if defined(__x86_64__) || defined(_M_X64)
#include <immintrin.h>
#define MPSC_PAUSE() _mm_pause()
#else
#define MPSC_PAUSE()                                                                                                   \
    do {                                                                                                               \
    } while (0)
#endif

namespace bb::ipc {

namespace {
// ----- Utilities -----

inline uint64_t mpsc_mono_ns_now()
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        return 0;
    }
    return (static_cast<uint64_t>(ts.tv_sec) * 1000000000ULL) + static_cast<uint64_t>(ts.tv_nsec);
}

inline int mpsc_futex_wait(volatile uint32_t* addr, uint32_t expect)
{
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
    return static_cast<int>(syscall(SYS_futex, addr, FUTEX_WAIT, expect, nullptr, nullptr, 0));
}

inline int mpsc_futex_wake(volatile uint32_t* addr, int n)
{
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
    return static_cast<int>(syscall(SYS_futex, addr, FUTEX_WAKE, n, nullptr, nullptr, 0));
}
} // anonymous namespace

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
    size_t doorbell_len = sizeof(MpscDoorbell);

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

int MpscConsumer::wait_for_data(uint32_t spin_ns)
{
    size_t num_rings = rings_.size();

    // Phase 1: Quick poll all rings starting from NEXT after last_served (round-robin)
    for (size_t i = 0; i < num_rings; i++) {
        size_t idx = (last_served_ + 1 + i) % num_rings;
        if (rings_[idx].available() > 0) {
            last_served_ = idx;
            return static_cast<int>(idx);
        }
    }

    // Phase 2: Spin phase
    if (spin_ns > 0) {
        uint64_t start = mpsc_mono_ns_now();
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-do-while)
        do {
            for (size_t i = 0; i < num_rings; i++) {
                size_t idx = (last_served_ + 1 + i) % num_rings;
                if (rings_[idx].available() > 0) {
                    last_served_ = idx;
                    return static_cast<int>(idx);
                }
            }
            MPSC_PAUSE();
        } while ((mpsc_mono_ns_now() - start) < spin_ns);
    }

    // Phase 3: Sleep on doorbell
    uint32_t seq = doorbell_->seq.load(std::memory_order_acquire);

    // Check again before sleeping to avoid race
    for (size_t i = 0; i < num_rings; i++) {
        size_t idx = (last_served_ + 1 + i) % num_rings;
        if (rings_[idx].available() > 0) {
            last_served_ = idx;
            return static_cast<int>(idx);
        }
    }

    mpsc_futex_wait(reinterpret_cast<volatile uint32_t*>(&doorbell_->seq), seq);

    // After waking, poll again
    for (size_t i = 0; i < num_rings; i++) {
        size_t idx = (last_served_ + 1 + i) % num_rings;
        if (rings_[idx].available() > 0) {
            last_served_ = idx;
            return static_cast<int>(idx);
        }
    }

    return -1; // No data available
}

void* MpscConsumer::peek(size_t ring_idx, size_t* n)
{
    if (ring_idx >= rings_.size()) {
        if (n != nullptr) {
            *n = 0;
        }
        return nullptr;
    }
    return rings_[ring_idx].peek(n);
}

void MpscConsumer::release(size_t ring_idx, size_t n)
{
    if (ring_idx < rings_.size()) {
        rings_[ring_idx].release(n);
    }
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
    SpscShm ring = SpscShm::connect(ring_name);

    return MpscProducer(std::move(ring), doorbell_fd, doorbell_len, doorbell, producer_id);
}

void* MpscProducer::claim(size_t want, size_t* granted)
{
    return ring_.claim(want, granted);
}

void MpscProducer::publish(size_t n)
{
    // Publish to ring first
    ring_.publish(n);

    // Ring doorbell to wake consumer
    // Note: We always ring the doorbell - see spsc_shm.cpp for explanation
    doorbell_->seq.fetch_add(1, std::memory_order_release);
    mpsc_futex_wake(reinterpret_cast<volatile uint32_t*>(&doorbell_->seq), 1);
}

bool MpscProducer::wait_for_space(size_t need, uint32_t spin_ns)
{
    return ring_.wait_for_space(need, spin_ns);
}

} // namespace bb::ipc
