#pragma once
#include "log.hpp"
#include "memory.h"
#include "tracy/Tracy.hpp"
#include <atomic>
#include <cstddef>
#include <cstdlib>
#include <memory>
#include <new>
#include <utility>
#if defined(__GLIBC__)
#include <malloc.h>
#elif defined(__APPLE__)
#include <malloc/malloc.h>
#endif
#if !defined(__wasm__) && !defined(_WIN32)
#include <sys/mman.h>
#endif

// This can be altered to capture stack traces, though more expensive
// so wrap TracyAlloc or TracyAllocS. We disable these if gates are being tracked
// Gates are hackishly tracked as if they were memory, for the sweet sweet memory
// stack tree that doesn't seem to be available for other metric types.
#ifndef TRACY_HACK_GATES_AS_MEMORY
#define TRACY_ALLOC(t, size) TracyAllocS(t, size, /*stack depth*/ 10)
#define TRACY_FREE(t) TracyFreeS(t, /*stack depth*/ 10)
#define TRACY_GATE_ALLOC(t)
#define TRACY_GATE_FREE(t)
#else
#include <mutex>
#include <set>
#define TRACY_ALLOC(t, size)
#define TRACY_FREE(t)

namespace bb {
// These are hacks to make sure tracy plays along
// If we free an ID not allocated, or allocate an index twice without a free it will complain
// so we hack thread-safety and an incrementing global ID.
static std::mutex GLOBAL_GATE_MUTEX;
static size_t GLOBAL_GATE = 0;
static std::set<size_t> FREED_GATES; // hack to prevent instrumentation failures
} // namespace bb
#define TRACY_GATE_ALLOC(index) TracyAllocS(reinterpret_cast<void*>(index), 1, /*stack depth*/ 50)
#define TRACY_GATE_FREE(index) TracyFreeS(reinterpret_cast<void*>(index), /*stack depth*/ 50)
#endif
// #define TRACY_ALLOC(t, size) TracyAlloc(t, size)
// #define TRACY_FREE(t) TracyFree(t)

namespace bb {
/**
 * @brief Return free heap memory to the operating system.
 * @details glibc keeps freed memory in its arenas and Apple's libmalloc in its zones, where it stays resident (and on
 * Apple counts towards the process footprint) until reused. Call after releasing a large structure whose memory the
 * next phase will not reuse. The prover calls it only in low memory mode: when resident memory is not bounded,
 * returning the pages just means faulting them back in later. No-op on other allocators.
 */
inline void release_free_heap_memory()
{
#if defined(__GLIBC__)
    malloc_trim(0);
#elif defined(__APPLE__)
    // All zones, with no goal: return as much cached free memory as possible. On recent macOS this returns nothing from
    // the large cache, which holds most of the retained memory; configure_heap_for_low_memory() keeps large
    // allocations out of it instead.
    malloc_zone_pressure_relief(nullptr, 0);
#endif
}

/**
 * @brief Make glibc return freed memory to the operating system promptly, for runs that bound resident memory.
 * @details By default glibc raises its mmap threshold to the size of each freed mmap-served chunk (up to 32 MiB) and
 * its trim threshold to twice that. After one large buffer is freed, later buffers of up to 32 MiB are carved from
 * the heap instead of mapped, and up to 64 MiB of free heap is kept resident. Setting both thresholds explicitly turns
 * that adjustment off: chunks of 1 MiB or more are always mapped and unmapped on free, and free heap above 1 MiB is
 * returned. Apple's libmalloc has no mallopt equivalent that can be set from inside the process (its tuning is
 * environment variables read at startup); there the retention is its large cache, which malloc_zone_pressure_relief
 * does not empty. So on Apple a replacement global operator new (mem.cpp) applies the same idea at libmalloc's own
 * large-block threshold: once this has run, every allocation of 128 KiB or more is an anonymous mapping of its own,
 * unmapped when it is deleted, and never enters the cache. Allocations made through malloc directly still do.
 * ScratchBuffer maps its buffer directly on every platform.
 */
namespace detail {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
inline std::atomic<bool> map_scratch_directly{ false };
// Defined in mem.cpp next to the operator new replacement, so a binary that configures the heap always links it.
void enable_large_allocation_mapping();
/** @brief Whether ptr is a block the replacement operator new mapped directly (always false off Apple). */
bool is_directly_mapped_allocation(const void* ptr);
/**
 * @brief Called with the size of every operator new request while set; for a test that bounds a function's allocations.
 * @details Only where this library replaces operator new (Apple without TRACY_MEMORY): a test cannot define a second
 * replacement there. Elsewhere the setter is a no-op and a test replaces operator new itself.
 */
using AllocationObserver = void (*)(size_t);
void set_allocation_observer(AllocationObserver observer);
} // namespace detail

inline void configure_heap_for_low_memory()
{
#if defined(__GLIBC__)
    constexpr int threshold = 1 << 20;
    mallopt(M_MMAP_THRESHOLD, threshold);
    mallopt(M_TRIM_THRESHOLD, threshold);
#endif
    detail::map_scratch_directly.store(true, std::memory_order_relaxed);
    detail::enable_large_allocation_mapping();
}

/**
 * @brief An uninitialized byte buffer for large, short-lived scratch, such as a multi-scalar multiplication's arena.
 * @details After configure_heap_for_low_memory() the buffer is an anonymous mapping of its own, unmapped when it is
 * destroyed; otherwise it comes from operator new as before. On glibc the pinned 1 MiB mmap threshold already maps
 * such buffers. Apple's libmalloc instead keeps freed large regions in its large cache, where they stay in the process
 * footprint and malloc_zone_pressure_relief does not reclaim them; mapping the buffer directly bypasses that cache
 * (MallocLargeCache=0 in the environment is the out-of-process equivalent, which a sandboxed process cannot set). Heap
 * memory on WASM and Windows.
 */
class ScratchBuffer {
  public:
    ScratchBuffer() = default;
    explicit ScratchBuffer(size_t bytes)
        : size_(bytes)
    {
        if (bytes == 0) {
            return;
        }
#if !defined(__wasm__) && !defined(_WIN32)
        if (detail::map_scratch_directly.load(std::memory_order_relaxed)) {
            void* addr = mmap(nullptr, bytes, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS, -1, 0);
            if (addr == MAP_FAILED) {
                throw std::bad_alloc();
            }
            data_ = static_cast<std::byte*>(addr);
            mapped_ = true;
            return;
        }
#endif
        data_ = new std::byte[bytes]; // NOLINT(cppcoreguidelines-owning-memory)
    }
    ~ScratchBuffer() { release(); }
    ScratchBuffer(const ScratchBuffer&) = delete;
    ScratchBuffer& operator=(const ScratchBuffer&) = delete;
    ScratchBuffer(ScratchBuffer&& other) noexcept
        : data_(std::exchange(other.data_, nullptr))
        , size_(std::exchange(other.size_, 0))
        , mapped_(std::exchange(other.mapped_, false))
    {}
    ScratchBuffer& operator=(ScratchBuffer&& other) noexcept
    {
        if (this != &other) {
            release();
            data_ = std::exchange(other.data_, nullptr);
            size_ = std::exchange(other.size_, 0);
            mapped_ = std::exchange(other.mapped_, false);
        }
        return *this;
    }

    std::byte* data() const { return data_; }
    size_t size() const { return size_; }
    /** @brief Whether the buffer is an anonymous mapping of its own rather than heap memory. */
    bool is_mapped() const { return mapped_; }

  private:
    void release()
    {
        if (data_ == nullptr) {
            return;
        }
#if !defined(__wasm__) && !defined(_WIN32)
        if (mapped_) {
            munmap(data_, size_);
            data_ = nullptr;
            return;
        }
#endif
        delete[] data_; // NOLINT(cppcoreguidelines-owning-memory)
        data_ = nullptr;
    }

    std::byte* data_ = nullptr;
    size_t size_ = 0;
    bool mapped_ = false;
};
} // namespace bb

#define pad(size, alignment) (size - (size % alignment) + ((size % alignment) == 0 ? 0 : alignment))

// Apple and Android use posix_memalign (Android's aligned_alloc requires API 28+)
#if defined(__APPLE__) || defined(__ANDROID__)
inline void* aligned_alloc(size_t alignment, size_t size)
{
    void* t = 0;
    posix_memalign(&t, alignment, size);
    if (t == 0) {
        info("bad alloc of size: ", size);
        std::abort();
    }
    TRACY_ALLOC(t, size);
    return t;
}

inline void aligned_free(void* mem)
{
    TRACY_FREE(mem);
    free(mem);
}
#endif

// Linux (but not Android) and WASM use the standard aligned_alloc
#if (defined(__linux__) && !defined(__ANDROID__)) || defined(__wasm__)
inline void* protected_aligned_alloc(size_t alignment, size_t size)
{
    size += (size % alignment);
    void* t = nullptr;
    // pad size to alignment
    if (size % alignment != 0) {
        size += alignment - (size % alignment);
    }
    // NOLINTNEXTLINE(cppcoreguidelines-owning-memory)
    t = aligned_alloc(alignment, size);
    if (t == nullptr) {
        info("bad alloc of size: ", size);
        std::abort();
    }
    TRACY_ALLOC(t, size);
    return t;
}

#define aligned_alloc protected_aligned_alloc

inline void aligned_free(void* mem)
{
    TRACY_FREE(mem);
    // NOLINTNEXTLINE(cppcoreguidelines-owning-memory, cppcoreguidelines-no-malloc)
    free(mem);
}
#endif

#ifdef _WIN32
inline void* aligned_alloc(size_t alignment, size_t size)
{
    void* t = _aligned_malloc(size, alignment);
    TRACY_ALLOC(t, size);
    return t;
}

inline void aligned_free(void* mem)
{
    TRACY_FREE(mem);
    _aligned_free(mem);
}
#endif

// inline void print_malloc_info()
// {
//     struct mallinfo minfo = mallinfo();

//     info("Total non-mmapped bytes (arena): ", minfo.arena);
//     info("Number of free chunks (ordblks): ", minfo.ordblks);
//     info("Number of fastbin blocks (smblks): ", minfo.smblks);
//     info("Number of mmapped regions (hblks): ", minfo.hblks);
//     info("Space allocated in mmapped regions (hblkhd): ", minfo.hblkhd);
//     info("Maximum total allocated space (usmblks): ", minfo.usmblks);
//     info("Space available in freed fastbin blocks (fsmblks): ", minfo.fsmblks);
//     info("Total allocated space (uordblks): ", minfo.uordblks);
//     info("Total free space (fordblks): ", minfo.fordblks);
//     info("Top-most, releasable space (keepcost): ", minfo.keepcost);
// }

inline void* tracy_malloc(size_t size)
{
    // NOLINTNEXTLINE(cppcoreguidelines-owning-memory, cppcoreguidelines-no-malloc)
    void* t = malloc(size);
    TRACY_ALLOC(t, size);
    return t;
}

inline void tracy_free(void* mem)
{
    TRACY_FREE(mem);
    // NOLINTNEXTLINE(cppcoreguidelines-owning-memory, cppcoreguidelines-no-malloc)
    free(mem);
}
