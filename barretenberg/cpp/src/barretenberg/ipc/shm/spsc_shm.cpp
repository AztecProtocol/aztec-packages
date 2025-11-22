#include "spsc_shm.hpp"
#include "futex.hpp"
#include "utilities.hpp"
#include <atomic>
#include <cerrno>
#include <climits>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <iostream>
#include <stdexcept>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <unistd.h>

namespace bb::ipc {

namespace {

inline uint64_t pow2_ceil_u64(uint64_t x)
{
    if (x < 2) {
        return 2;
    }
    x--;
    x |= x >> 1;
    x |= x >> 2;
    x |= x >> 4;
    x |= x >> 8;
    x |= x >> 16;
    x |= x >> 32;
    return x + 1;
}

} // anonymous namespace

// ----- SpscShm Implementation -----

SpscShm::SpscShm(int fd, size_t map_len, SpscCtrl* ctrl, uint8_t* buf)
    : fd_(fd)
    , map_len_(map_len)
    , ctrl_(ctrl)
    , buf_(buf)
{}

SpscShm::SpscShm(SpscShm&& other) noexcept
    : fd_(other.fd_)
    , map_len_(other.map_len_)
    , ctrl_(other.ctrl_)
    , buf_(other.buf_)
{
    other.fd_ = -1;
    other.map_len_ = 0;
    other.ctrl_ = nullptr;
    other.buf_ = nullptr;
}

SpscShm& SpscShm::operator=(SpscShm&& other) noexcept
{
    if (this != &other) {
        // Clean up current resources
        if (ctrl_ != nullptr) {
            munmap(ctrl_, map_len_);
        }
        if (fd_ >= 0) {
            ::close(fd_);
        }

        // Move from other
        fd_ = other.fd_;
        map_len_ = other.map_len_;
        ctrl_ = other.ctrl_;
        buf_ = other.buf_;

        // Clear other
        other.fd_ = -1;
        other.map_len_ = 0;
        other.ctrl_ = nullptr;
        other.buf_ = nullptr;
    }
    return *this;
}

SpscShm::~SpscShm()
{
    if (ctrl_ != nullptr) {
        munmap(ctrl_, map_len_);
    }
    if (fd_ >= 0) {
        ::close(fd_);
    }
}

SpscShm SpscShm::create(const std::string& name, size_t min_capacity)
{
    if (name.empty()) {
        throw std::runtime_error("SpscShm::create: empty name");
    }

    size_t cap = pow2_ceil_u64(min_capacity);
    size_t map_len = sizeof(SpscCtrl) + cap;

    int fd = shm_open(name.c_str(), O_RDWR | O_CREAT | O_EXCL, 0600);
    if (fd < 0) {
        throw std::runtime_error("SpscShm::create: shm_open failed: " + std::string(std::strerror(errno)));
    }

    if (ftruncate(fd, static_cast<off_t>(map_len)) != 0) {
        int e = errno;
        ::close(fd);
        shm_unlink(name.c_str());
        throw std::runtime_error("SpscShm::create: ftruncate failed: " + std::string(std::strerror(e)));
    }

    void* mem = mmap(nullptr, map_len, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (mem == MAP_FAILED) {
        int e = errno;
        ::close(fd);
        shm_unlink(name.c_str());
        throw std::runtime_error("SpscShm::create: mmap failed: " + std::string(std::strerror(e)));
    }

    std::memset(mem, 0, map_len);
    auto* ctrl = static_cast<SpscCtrl*>(mem);

    // Initialize non-atomic fields first
    ctrl->capacity = cap;
    ctrl->mask = cap - 1;

    // Initialize atomics with release ordering to ensure capacity/mask are visible
    ctrl->head.store(0ULL, std::memory_order_release);
    ctrl->tail.store(0ULL, std::memory_order_release);
    ctrl->data_seq.store(0U, std::memory_order_release);
    ctrl->space_seq.store(0U, std::memory_order_release);
    ctrl->consumer_blocked.store(false, std::memory_order_release);
    ctrl->producer_blocked.store(false, std::memory_order_release);

    auto* buf = reinterpret_cast<uint8_t*>(ctrl + 1);
    return SpscShm(fd, map_len, ctrl, buf);
}

SpscShm SpscShm::connect(const std::string& name)
{
    if (name.empty()) {
        throw std::runtime_error("SpscShm::connect: empty name");
    }

    int fd = shm_open(name.c_str(), O_RDWR, 0600);
    if (fd < 0) {
        throw std::runtime_error("SpscShm::connect: shm_open failed: " + std::string(std::strerror(errno)));
    }

    struct stat st;
    if (fstat(fd, &st) != 0) {
        int e = errno;
        ::close(fd);
        throw std::runtime_error("SpscShm::connect: fstat failed: " + std::string(std::strerror(e)));
    }
    size_t map_len = static_cast<size_t>(st.st_size);

    void* mem = mmap(nullptr, map_len, PROT_READ | PROT_WRITE, MAP_SHARED, fd, 0);
    if (mem == MAP_FAILED) {
        int e = errno;
        ::close(fd);
        throw std::runtime_error("SpscShm::connect: mmap failed: " + std::string(std::strerror(e)));
    }

    auto* ctrl = static_cast<SpscCtrl*>(mem);
    auto* buf = reinterpret_cast<uint8_t*>(ctrl + 1);

    // Ensure initialization is visible before use (pairs with release in create)
    (void)ctrl->head.load(std::memory_order_acquire);

    return SpscShm(fd, map_len, ctrl, buf);
}

bool SpscShm::unlink(const std::string& name)
{
    return shm_unlink(name.c_str()) == 0;
}

uint64_t SpscShm::available() const
{
    uint64_t head = ctrl_->head.load(std::memory_order_acquire);
    uint64_t tail = ctrl_->tail.load(std::memory_order_acquire);
    return head - tail;
}

uint64_t SpscShm::free_space() const
{
    uint64_t cap = ctrl_->capacity;
    uint64_t used = available();
    return cap - used;
}

void* SpscShm::claim(size_t want, uint32_t timeout_ns)
{
    // Wait for contiguous space to be available
    if (!wait_for_space(want, timeout_ns)) {
        return nullptr; // Timeout
    }

    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;
    uint64_t head = ctrl_->head.load(std::memory_order_relaxed);
    uint64_t pos = head & mask;
    uint64_t till_end = cap - pos;

    // Check if it fits contiguously without wrapping
    if (want <= till_end) {
        // Fits contiguously - no wrap
        return buf_ + pos;
    }

    // Needs to wrap
    return buf_; // Return pointer to beginning of ring
}

void SpscShm::publish(size_t n)
{
    uint64_t head = ctrl_->head.load(std::memory_order_relaxed);
    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;
    uint64_t pos = head & mask;
    uint64_t till_end = cap - pos;

    // Detect if we published wrapped data
    // If at current head position we can't fit n bytes, it must have wrapped
    uint64_t total_advance;
    if (n > till_end) {
        // We wrote at the beginning after wrapping - skip padding and our data
        total_advance = till_end + n;
    } else {
        // Normal case: wrote at current position
        total_advance = n;
    }

    // Advance head atomically
    ctrl_->head.store(head + total_advance, std::memory_order_release);

    // Always increment seq (for futex synchronization)
    ctrl_->data_seq.fetch_add(1, std::memory_order_release);

    // Conditional wake: Only wake if consumer is blocked on futex
    if (ctrl_->consumer_blocked.load(std::memory_order_acquire)) {
        futex_wake(reinterpret_cast<volatile uint32_t*>(&ctrl_->data_seq), 1);
    }
}

void* SpscShm::peek(size_t want, uint32_t timeout_ns)
{
    // Wait for contiguous data to be available
    if (!wait_for_data(want, timeout_ns)) {
        return nullptr; // Timeout
    }

    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;
    uint64_t tail = ctrl_->tail.load(std::memory_order_relaxed);
    uint64_t pos = tail & mask;
    uint64_t till_end = cap - pos;

    // Simple rule: if want doesn't fit, wrap to beginning
    if (want > till_end) {
        return buf_;
    }

    // Data fits contiguously at current position
    return buf_ + pos;
}

void SpscShm::release(size_t n)
{
    uint64_t tail = ctrl_->tail.load(std::memory_order_relaxed);
    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;
    uint64_t pos = tail & mask;
    uint64_t till_end = cap - pos;
    uint64_t head = ctrl_->head.load(std::memory_order_acquire);

    bool was_full = ((head - tail) == cap);

    // Simple rule: if n doesn't fit, we released wrapped data
    uint64_t total_release;
    if (n > till_end) {
        // Data was wrapped - skip padding and our data
        total_release = till_end + n;
    } else {
        // Normal case: data was contiguous
        total_release = n;
    }

    ctrl_->tail.store(tail + total_release, std::memory_order_release);

    if (was_full) {
        // Always increment seq (for futex synchronization)
        ctrl_->space_seq.fetch_add(1, std::memory_order_release);

        // Conditional wake: Only wake if producer is blocked on futex
        if (ctrl_->producer_blocked.load(std::memory_order_acquire)) {
            futex_wake(reinterpret_cast<volatile uint32_t*>(&ctrl_->space_seq), 1);
        }
    }
}

bool SpscShm::wait_for_data(size_t need, uint32_t timeout_ns)
{
    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;

    // Check if we need contiguous data that would wrap
    auto check_available = [this, cap, mask, need]() -> bool {
        uint64_t head = ctrl_->head.load(std::memory_order_acquire);
        uint64_t tail = ctrl_->tail.load(std::memory_order_relaxed);
        uint64_t avail = head - tail;

        if (avail < need) {
            return false; // Not enough total data
        }

        // Check if data is contiguous
        uint64_t pos = tail & mask;
        uint64_t till_end = cap - pos;

        if (need <= till_end) {
            return true; // Fits contiguously
        }

        // Would wrap - need padding + actual data available
        return avail >= (till_end + need);
    };

    if (check_available()) {
        previous_had_data_ = true; // Found data - enable spinning on next call
        return true;
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

    // Spin phase (only if previous call found data)
    if (spin_duration > 0) {
        uint64_t start = mono_ns_now();
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-do-while)
        do {
            if (check_available()) {
                previous_had_data_ = true; // Found data during spin
                return true;
            }
            IPC_PAUSE();
        } while ((mono_ns_now() - start) < spin_duration);

        // Check after spin
        if (check_available()) {
            previous_had_data_ = true; // Found data after spin
            return true;
        }
    }

    // No more time or didn't spin - check if we can block
    if (remaining_timeout == 0) {
        previous_had_data_ = false; // Timeout - disable spinning on next call
        return false;
    }

    // About to block - load seq, final check, then block
    uint32_t seq = ctrl_->data_seq.load(std::memory_order_acquire);
    if (check_available()) {
        previous_had_data_ = true; // Found data before blocking
        return true;
    }

    // Set blocked flag RIGHT BEFORE futex_wait
    ctrl_->consumer_blocked.store(true, std::memory_order_release);
    futex_wait_timeout(reinterpret_cast<volatile uint32_t*>(&ctrl_->data_seq), seq, remaining_timeout);
    ctrl_->consumer_blocked.store(false, std::memory_order_relaxed);

    bool result = check_available();
    previous_had_data_ = result; // Update flag based on final result
    return result;
}

bool SpscShm::wait_for_space(size_t need, uint32_t timeout_ns)
{
    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;

    // Check if we need contiguous space that would wrap
    auto check_space = [this, cap, mask, need]() -> bool {
        uint64_t head = ctrl_->head.load(std::memory_order_relaxed);
        uint64_t tail = ctrl_->tail.load(std::memory_order_acquire);
        uint64_t freeb = cap - (head - tail);

        if (freeb < need) {
            return false; // Not enough total free space
        }

        // Check if space is contiguous
        uint64_t pos = head & mask;
        uint64_t till_end = cap - pos;

        if (need <= till_end) {
            return true; // Fits contiguously
        }

        // Would wrap - just check if we have enough total space
        // If we have till_end + need bytes free, the ring buffer invariant
        // guarantees the beginning is available for writing
        return freeb >= (till_end + need);
    };

    if (check_space()) {
        previous_had_space_ = true; // Found space - enable spinning on next call
        return true;
    }

    // Adaptive spinning: only spin if previous call found space
    constexpr uint64_t SPIN_NS = 100000; // 100us
    uint64_t spin_duration;
    uint64_t remaining_timeout;

    if (previous_had_space_) {
        // Previous call found space - do full spin (optimistic)
        spin_duration = (timeout_ns < SPIN_NS) ? timeout_ns : SPIN_NS;
        remaining_timeout = (timeout_ns > SPIN_NS) ? (timeout_ns - SPIN_NS) : 0;
    } else {
        // Previous call timed out - skip spinning (idle channel)
        spin_duration = 0;
        remaining_timeout = timeout_ns;
    }

    // Spin phase (only if previous call found space)
    if (spin_duration > 0) {
        uint64_t start = mono_ns_now();
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-do-while)
        do {
            if (check_space()) {
                previous_had_space_ = true; // Found space during spin
                return true;
            }
            IPC_PAUSE();
        } while ((mono_ns_now() - start) < spin_duration);

        // Check after spin
        if (check_space()) {
            previous_had_space_ = true; // Found space after spin
            return true;
        }
    }

    // No more time or didn't spin - check if we can block
    if (remaining_timeout == 0) {
        previous_had_space_ = false; // Timeout - disable spinning on next call
        return false;
    }

    // About to block - load seq, final check, then block
    uint32_t seq = ctrl_->space_seq.load(std::memory_order_acquire);
    if (check_space()) {
        previous_had_space_ = true; // Found space before blocking
        return true;
    }

    // Set blocked flag RIGHT BEFORE futex_wait
    ctrl_->producer_blocked.store(true, std::memory_order_release);
    futex_wait_timeout(reinterpret_cast<volatile uint32_t*>(&ctrl_->space_seq), seq, remaining_timeout);
    ctrl_->producer_blocked.store(false, std::memory_order_relaxed);

    bool result = check_space();
    previous_had_space_ = result; // Update flag based on final result
    return result;
}

void SpscShm::wakeup_all()
{
    // Wake any consumer blocked on data_seq
    futex_wake(reinterpret_cast<volatile uint32_t*>(&ctrl_->data_seq), INT_MAX);
    // Wake any producer blocked on space_seq
    futex_wake(reinterpret_cast<volatile uint32_t*>(&ctrl_->space_seq), INT_MAX);
}

} // namespace bb::ipc
