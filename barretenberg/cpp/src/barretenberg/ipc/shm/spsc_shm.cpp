#include "barretenberg/ipc/shm/spsc_shm.hpp"
#include <atomic>
#include <cerrno>
#include <cstdint>
#include <cstring>
#include <fcntl.h>
#include <linux/futex.h>
#include <stdexcept>
#include <string>
#include <sys/mman.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <time.h> // NOLINT(modernize-deprecated-headers) - need POSIX clock_gettime/CLOCK_MONOTONIC
#include <unistd.h>

#if defined(__x86_64__) || defined(_M_X64)
#include <immintrin.h>
#define SPSC_PAUSE() _mm_pause()
#else
#define SPSC_PAUSE()                                                                                                   \
    do {                                                                                                               \
    } while (0)
#endif

namespace bb::ipc {

namespace {
// ----- Utilities -----

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

inline uint64_t mono_ns_now()
{
    struct timespec ts;
    if (clock_gettime(CLOCK_MONOTONIC, &ts) != 0) {
        return 0;
    }
    return (static_cast<uint64_t>(ts.tv_sec) * 1000000000ULL) + static_cast<uint64_t>(ts.tv_nsec);
}

// Futex helpers
inline int futex_wait(volatile uint32_t* addr, uint32_t expect)
{
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
    return static_cast<int>(syscall(SYS_futex, addr, FUTEX_WAIT, expect, nullptr, nullptr, 0));
}

inline int futex_wake(volatile uint32_t* addr, int n)
{
    // NOLINTNEXTLINE(cppcoreguidelines-pro-type-vararg)
    return static_cast<int>(syscall(SYS_futex, addr, FUTEX_WAKE, n, nullptr, nullptr, 0));
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

void* SpscShm::claim(size_t want, size_t* granted)
{
    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;

    uint64_t head = ctrl_->head.load(std::memory_order_relaxed);
    uint64_t tail = ctrl_->tail.load(std::memory_order_acquire);

    uint64_t freeb = cap - (head - tail);
    if (freeb == 0) {
        if (granted != nullptr) {
            *granted = 0;
        }
        return nullptr;
    }
    if (want > freeb) {
        // Not enough free space at all
        if (granted != nullptr) {
            *granted = 0;
        }
        return nullptr;
    }

    uint64_t pos = head & mask;
    uint64_t till_end = cap - pos;

    // Check if we have enough contiguous space
    if (want <= till_end) {
        // Fits contiguously - normal path
        if (granted != nullptr) {
            *granted = want;
        }
        return buf_ + pos;
    }

    // Not enough contiguous space - need to wrap
    // But first check if we'll have enough space after wrapping
    // After padding, we'll lose `till_end` bytes
    if (freeb < till_end + want) {
        // Not enough space even if we wrap
        if (granted != nullptr) {
            *granted = 0;
        }
        return nullptr;
    }

    // After wrapping, we'll write at the beginning of the ring (position 0).
    // Verify that the region [0, want) is actually free.
    // Even if total free space is sufficient, the beginning might still be occupied.
    uint64_t tail_pos = tail & mask;
    uint64_t new_head = head + till_end;

    // If tail is still at the beginning of the buffer (position < want),
    // we can't safely wrap and write there
    if (tail_pos < want && tail < new_head) {
        // Beginning of buffer is still occupied
        if (granted != nullptr) {
            *granted = 0;
        }
        return nullptr;
    }

    // Write zero-length marker as padding and advance head to wrap point
    // This makes the padding visible to the consumer to skip
    if (till_end >= sizeof(uint32_t)) {
        uint32_t zero_marker = 0;
        std::memcpy(buf_ + pos, &zero_marker, sizeof(uint32_t));
    }

    // Advance head past the padding to wrap to beginning
    // NOTE: We don't wake the consumer here - the caller will wake via publish()
    // after writing the actual message data
    head += till_end;
    ctrl_->head.store(head, std::memory_order_release);

    // Now claim from the beginning of the ring
    pos = head & mask; // Should be 0 or close to 0

    if (granted != nullptr) {
        *granted = want;
    }
    return buf_ + pos;
}

void SpscShm::publish(size_t n)
{
    uint64_t head = ctrl_->head.load(std::memory_order_relaxed);
    ctrl_->head.store(head + n, std::memory_order_release);

    // Always wake consumer - claim() may have already advanced head during wrapping,
    // so we can't rely on was_empty check. Futex wake is cheap if no one is waiting.
    ctrl_->data_seq.fetch_add(1, std::memory_order_release);
    futex_wake(reinterpret_cast<volatile uint32_t*>(&ctrl_->data_seq), 1);
}

void* SpscShm::peek(size_t* n)
{
    uint64_t cap = ctrl_->capacity;
    uint64_t mask = ctrl_->mask;

    // Loop to automatically skip padding messages
    while (true) {
        uint64_t head = ctrl_->head.load(std::memory_order_acquire);
        uint64_t tail = ctrl_->tail.load(std::memory_order_relaxed);

        uint64_t avail = head - tail;
        if (avail == 0) {
            if (n != nullptr) {
                *n = 0;
            }
            return nullptr;
        }

        uint64_t pos = tail & mask;
        uint64_t till_end = cap - pos;
        size_t grant = static_cast<size_t>((avail <= till_end) ? avail : till_end);

        // Check for padding marker (zero-length message)
        if (grant >= sizeof(uint32_t)) {
            uint32_t marker = 0;
            std::memcpy(&marker, buf_ + pos, sizeof(uint32_t));
            if (marker == 0) {
                // This is padding - skip it by releasing and continuing
                ctrl_->tail.store(tail + grant, std::memory_order_release);

                // Wake producer if ring was full
                if (avail == cap) {
                    ctrl_->space_seq.fetch_add(1, std::memory_order_release);
                    futex_wake(reinterpret_cast<volatile uint32_t*>(&ctrl_->space_seq), 1);
                }
                continue; // Try again from wrapped position
            }
        }

        // Not padding - return the data
        if (n != nullptr) {
            *n = grant;
        }
        return buf_ + pos;
    }
}

void SpscShm::release(size_t n)
{
    uint64_t tail = ctrl_->tail.load(std::memory_order_relaxed);
    uint64_t head = ctrl_->head.load(std::memory_order_acquire);
    uint64_t cap = ctrl_->capacity;

    bool was_full = ((head - tail) == cap);

    ctrl_->tail.store(tail + n, std::memory_order_release);

    if (was_full) {
        ctrl_->space_seq.fetch_add(1, std::memory_order_release);
        futex_wake(reinterpret_cast<volatile uint32_t*>(&ctrl_->space_seq), 1);
    }
}

bool SpscShm::wait_for_data(uint32_t spin_ns)
{
    if (available() > 0) {
        return true;
    }

    if (spin_ns > 0) {
        uint64_t start = mono_ns_now();
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-do-while)
        do {
            if (available() > 0) {
                return true;
            }
            SPSC_PAUSE();
        } while ((mono_ns_now() - start) < spin_ns);
    }

    if (available() > 0) {
        return true;
    }
    uint32_t seq = ctrl_->data_seq.load(std::memory_order_acquire);
    if (available() > 0) {
        return true;
    }
    futex_wait(reinterpret_cast<volatile uint32_t*>(&ctrl_->data_seq), seq);
    return available() > 0;
}

bool SpscShm::wait_for_space(size_t need, uint32_t spin_ns)
{
    if (free_space() >= need) {
        return true;
    }

    if (spin_ns > 0) {
        uint64_t start = mono_ns_now();
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-do-while)
        do {
            if (free_space() >= need) {
                return true;
            }
            SPSC_PAUSE();
        } while ((mono_ns_now() - start) < spin_ns);
    }

    if (free_space() >= need) {
        return true;
    }
    uint32_t seq = ctrl_->space_seq.load(std::memory_order_acquire);
    if (free_space() >= need) {
        return true;
    }
    futex_wait(reinterpret_cast<volatile uint32_t*>(&ctrl_->space_seq), seq);
    return free_space() >= need;
}

} // namespace bb::ipc
