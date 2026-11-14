#include "barretenberg/common/mem.hpp"
#include "barretenberg/common/try_catch_shim.hpp"

#if defined(__APPLE__) && !defined(TRACY_MEMORY)

#include <algorithm>
#include <array>
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <new>
#include <os/lock.h>
#include <sys/mman.h>
#include <type_traits>

namespace {

// Allocations of this size or more are mapped directly once low memory mode is on. It is libmalloc's own threshold for
// a large block, so nothing that would have gone through the large cache does. (Measured against 1 MiB, glibc's pinned
// mmap threshold: 5–7 MiB less footprint on the Chonk flows, no wall-time difference.)
constexpr size_t MAPPED_ALLOCATION_THRESHOLD = size_t{ 128 } << 10;

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<bool> mapping_enabled{ false };
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<bb::detail::AllocationObserver> allocation_observer{ nullptr };

void observe(size_t size)
{
    if (auto* observer = allocation_observer.load(std::memory_order_relaxed)) {
        observer(size);
    }
}

// The smallest page size of a supported Apple target (arm64 uses 16 KiB). A mapping starts on a page boundary, which
// satisfies any alignment up to this.
constexpr size_t MIN_PAGE_SIZE = 4096;

/**
 * @brief The live directly mapped blocks, so operator delete can tell them from heap pointers.
 * @details A fixed array under a lock; at most a few hundred such blocks are live at once, so a scan is cheap. Most
 * deletes never reach it: a mapped block starts on a page boundary, and a pointer that does not cannot be one. No
 * allocation happens under the lock. When the array is full, new large allocations fall back to the heap.
 *
 * The registry must outlive static destruction: a static object constructed before it can free a mapped block after
 * it would have been destroyed. So it is trivially destructible, and its lock is an os_unfair_lock, not a std::mutex
 * (locking a destroyed std::mutex fails with EINVAL).
 */
class MappedBlocks {
  public:
    static constexpr size_t CAPACITY = size_t{ 1 } << 12;

    bool insert(void* ptr, size_t size)
    {
        os_unfair_lock_lock(&lock_);
        const size_t count = count_.load(std::memory_order_relaxed);
        const bool has_room = count < CAPACITY;
        if (has_room) {
            entries_[count] = { ptr, size };
            count_.store(count + 1, std::memory_order_release);
        }
        os_unfair_lock_unlock(&lock_);
        return has_room;
    }

    /** @brief Removes ptr and returns its mapping size, or 0 when ptr is not a mapped block. */
    size_t remove(void* ptr)
    {
        // Every supported page size is a multiple of MIN_PAGE_SIZE, so a mapping is aligned to at least that.
        if ((reinterpret_cast<uintptr_t>(ptr) & (MIN_PAGE_SIZE - 1)) != 0 ||
            count_.load(std::memory_order_acquire) == 0) {
            return 0;
        }
        size_t size = 0;
        os_unfair_lock_lock(&lock_);
        const size_t count = count_.load(std::memory_order_relaxed);
        for (size_t i = 0; i < count; ++i) {
            if (entries_[i].ptr == ptr) {
                size = entries_[i].size;
                entries_[i] = entries_[count - 1];
                count_.store(count - 1, std::memory_order_release);
                break;
            }
        }
        os_unfair_lock_unlock(&lock_);
        return size;
    }

  private:
    struct Entry {
        void* ptr;
        size_t size;
    };
    std::array<Entry, CAPACITY> entries_{};
    // Written under the lock; read without it by remove() to skip the scan while no block is mapped.
    std::atomic<size_t> count_{ 0 };
    os_unfair_lock lock_ = OS_UNFAIR_LOCK_INIT;
};
static_assert(std::is_trivially_destructible_v<MappedBlocks>);

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
MappedBlocks mapped_blocks;

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
    observe(size);
    if (void* mapped = try_map(size); mapped != nullptr) {
        return mapped;
    }
    for (;;) {
        // operator new must return a non-null pointer for a zero size.
        if (void* ptr = std::malloc(size == 0 ? 1 : size)) { // NOLINT(cppcoreguidelines-no-malloc)
            return ptr;
        }
        auto handler = std::get_new_handler();
        if (handler == nullptr) {
            THROW std::bad_alloc();
        }
        handler();
    }
}

// Over-aligned types (bb::field is alignas(32), so every std::vector of field elements comes through here) use the
// aligned operator new, which libc++ serves from posix_memalign: the same large cache.
void* allocate_aligned(size_t size, size_t alignment)
{
    observe(size);
    if (alignment <= MIN_PAGE_SIZE) {
        if (void* mapped = try_map(size); mapped != nullptr) {
            return mapped;
        }
    }
    for (;;) {
        void* ptr = nullptr;
        if (posix_memalign(&ptr, std::max(alignment, sizeof(void*)), size == 0 ? 1 : size) == 0) {
            return ptr;
        }
        auto handler = std::get_new_handler();
        if (handler == nullptr) {
            THROW std::bad_alloc();
        }
        handler();
    }
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

void set_allocation_observer(AllocationObserver observer)
{
    allocation_observer.store(observer, std::memory_order_relaxed);
}
} // namespace bb::detail

// The array forms, the sized deallocation forms and the nothrow forms are not replaced: the library's defaults forward
// to these four.
void* operator new(std::size_t size)
{
    return allocate(size);
}
void operator delete(void* ptr) noexcept
{
    deallocate(ptr);
}
void* operator new(std::size_t size, std::align_val_t alignment)
{
    return allocate_aligned(size, static_cast<size_t>(alignment));
}
void operator delete(void* ptr, std::align_val_t /*alignment*/) noexcept
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
void set_allocation_observer(AllocationObserver) {}
} // namespace bb::detail

#endif
