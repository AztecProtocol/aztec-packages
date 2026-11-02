#include "barretenberg/common/mem.hpp"

#if defined(__APPLE__) && !defined(TRACY_MEMORY)

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <mutex>
#include <new>
#include <sys/mman.h>

namespace {

// Allocations of this size or more are mapped directly once low memory mode is on. It is libmalloc's own threshold for
// a large block, so nothing that would have gone through the large cache does. (Measured against 1 MiB, glibc's pinned
// mmap threshold: 5–7 MiB less footprint on the Chonk flows, no wall-time difference.)
constexpr size_t MAPPED_ALLOCATION_THRESHOLD = size_t{ 128 } << 10;

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<bool> mapping_enabled{ false };

/**
 * @brief The live directly mapped blocks, so operator delete can tell them from heap pointers.
 * @details A fixed array under a mutex; at most a few hundred such blocks are live at once, so a scan is cheap. Most
 * deletes never reach it: a mapped block starts on a page boundary, and a pointer that does not cannot be one. No
 * allocation happens under the lock. When the array is full, new large allocations fall back to the heap.
 */
class MappedBlocks {
  public:
    static constexpr size_t CAPACITY = size_t{ 1 } << 12;

    bool insert(void* ptr, size_t size)
    {
        const std::lock_guard<std::mutex> guard(mutex_);
        if (count_ == CAPACITY) {
            return false;
        }
        entries_[count_++] = { ptr, size };
        live_.store(count_, std::memory_order_release);
        return true;
    }

    /** @brief Removes ptr and returns its mapping size, or 0 when ptr is not a mapped block. */
    size_t remove(void* ptr)
    {
        constexpr uintptr_t PAGE_MASK = 4095;
        if ((reinterpret_cast<uintptr_t>(ptr) & PAGE_MASK) != 0 || live_.load(std::memory_order_acquire) == 0) {
            return 0;
        }
        const std::lock_guard<std::mutex> guard(mutex_);
        for (size_t i = 0; i < count_; ++i) {
            if (entries_[i].ptr == ptr) {
                const size_t size = entries_[i].size;
                entries_[i] = entries_[--count_];
                live_.store(count_, std::memory_order_release);
                return size;
            }
        }
        return 0;
    }

  private:
    struct Entry {
        void* ptr;
        size_t size;
    };
    std::array<Entry, CAPACITY> entries_{};
    size_t count_ = 0;
    std::atomic<size_t> live_{ 0 };
    std::mutex mutex_;
};

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
MappedBlocks mapped_blocks;

// A mapping starts on a page boundary, which satisfies any alignment up to the page size.
constexpr size_t PAGE_SIZE = 4096;

void* try_map(size_t size)
{
    if (size < MAPPED_ALLOCATION_THRESHOLD || !mapping_enabled.load(std::memory_order_relaxed)) {
        return nullptr;
    }
    void* addr = mmap(nullptr, size, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
    if (addr == MAP_FAILED) {
        return nullptr;
    }
    if (!mapped_blocks.insert(addr, size)) {
        munmap(addr, size);
        return nullptr;
    }
    return addr;
}

void* allocate(size_t size)
{
    if (void* mapped = try_map(size); mapped != nullptr) {
        return mapped;
    }
    // operator new must return a non-null pointer for a zero size.
    void* ptr = std::malloc(size == 0 ? 1 : size); // NOLINT(cppcoreguidelines-no-malloc)
    if (ptr == nullptr) {
        throw std::bad_alloc();
    }
    return ptr;
}

// Over-aligned types (bb::field is alignas(32), so every std::vector of field elements comes through here) use the
// aligned operator new, which libc++ serves from posix_memalign: the same large cache.
void* allocate_aligned(size_t size, size_t alignment)
{
    if (alignment <= PAGE_SIZE) {
        if (void* mapped = try_map(size); mapped != nullptr) {
            return mapped;
        }
    }
    void* ptr = nullptr;
    if (posix_memalign(&ptr, std::max(alignment, sizeof(void*)), size == 0 ? 1 : size) != 0) {
        throw std::bad_alloc();
    }
    return ptr;
}

void deallocate(void* ptr) noexcept
{
    if (ptr == nullptr) {
        return;
    }
    if (const size_t size = mapped_blocks.remove(ptr); size != 0) {
        munmap(ptr, size);
        return;
    }
    std::free(ptr); // NOLINT(cppcoreguidelines-no-malloc)
}

} // namespace

namespace bb::detail {
void enable_large_allocation_mapping()
{
    mapping_enabled.store(true, std::memory_order_relaxed);
}

bool is_directly_mapped_allocation(const void* ptr)
{
    return malloc_size(ptr) == 0;
}
} // namespace bb::detail

void* operator new(std::size_t size)
{
    return allocate(size);
}
void* operator new[](std::size_t size)
{
    return allocate(size);
}
void operator delete(void* ptr) noexcept
{
    deallocate(ptr);
}
void operator delete(void* ptr, std::size_t /*size*/) noexcept
{
    deallocate(ptr);
}
void operator delete[](void* ptr) noexcept
{
    deallocate(ptr);
}
void operator delete[](void* ptr, std::size_t /*size*/) noexcept
{
    deallocate(ptr);
}
void* operator new(std::size_t size, std::align_val_t alignment)
{
    return allocate_aligned(size, static_cast<size_t>(alignment));
}
void* operator new[](std::size_t size, std::align_val_t alignment)
{
    return allocate_aligned(size, static_cast<size_t>(alignment));
}
void operator delete(void* ptr, std::align_val_t /*alignment*/) noexcept
{
    deallocate(ptr);
}
void operator delete(void* ptr, std::size_t /*size*/, std::align_val_t /*alignment*/) noexcept
{
    deallocate(ptr);
}
void operator delete[](void* ptr, std::align_val_t /*alignment*/) noexcept
{
    deallocate(ptr);
}
void operator delete[](void* ptr, std::size_t /*size*/, std::align_val_t /*alignment*/) noexcept
{
    deallocate(ptr);
}

#else

namespace bb::detail {
void enable_large_allocation_mapping() {}
bool is_directly_mapped_allocation(const void*)
{
    return false;
}
} // namespace bb::detail

#endif
