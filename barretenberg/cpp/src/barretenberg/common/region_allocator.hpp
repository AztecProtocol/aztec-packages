#pragma once

#include "mem.hpp"
#include <atomic>
#include <cassert>
#include <cstddef>
#include <cstdlib>
#include <new>
#include <vector>

namespace bb {

/**
 * @brief A region-based bump allocator for use via a custom STL allocator.
 *
 * When activated via BB_USE_REGION_ALLOCATOR, containers using region_stl_allocator<T>
 * bump-allocate from a pre-allocated contiguous region instead of going through malloc.
 * Deallocation is a no-op; the entire region is freed at once when the RAII guard destructs.
 *
 * This eliminates malloc arena contention at high thread counts (e.g. 192 cores).
 *
 * Constraints:
 * - Activate from the main thread only
 * - No nesting
 * - All region-allocated objects must be destroyed before the guard (declare guard first in scope)
 */
struct RegionAllocator {
    // Members ordered to match initializer list
    char* base_ = nullptr;
    size_t num_threads_ = 0;
    size_t region_size_ = 0;
    size_t total_size_ = 0;

    // Per-thread bump state, cache-line aligned to avoid false sharing
    struct alignas(64) ThreadRegion {
        std::atomic<size_t> offset{ 0 };
    };
    ThreadRegion* thread_regions_ = nullptr;
    std::atomic<size_t> next_thread_idx_{ 0 };

    RegionAllocator(size_t num_threads, size_t alloc_per_thread) noexcept
        : num_threads_(num_threads)
        , region_size_(alloc_per_thread)
        , total_size_(num_threads * alloc_per_thread)
    {
        // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
        base_ = static_cast<char*>(std::malloc(total_size_));
        if (base_ == nullptr) {
            total_size_ = 0;
        }
        if (base_ != nullptr) {
            // NOLINTNEXTLINE(cppcoreguidelines-no-malloc,cppcoreguidelines-owning-memory)
            thread_regions_ = static_cast<ThreadRegion*>(std::malloc(num_threads * sizeof(ThreadRegion)));
            for (size_t i = 0; i < num_threads; ++i) {
                new (&thread_regions_[i]) ThreadRegion();
            }
        }
    }

    ~RegionAllocator()
    {
        // NOLINTNEXTLINE(cppcoreguidelines-no-malloc,cppcoreguidelines-owning-memory)
        std::free(thread_regions_);
        // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
        std::free(base_);
    }

    RegionAllocator(const RegionAllocator&) = delete;
    RegionAllocator& operator=(const RegionAllocator&) = delete;
    RegionAllocator(RegionAllocator&&) = delete;
    RegionAllocator& operator=(RegionAllocator&&) = delete;

    void* allocate(size_t size, size_t alignment = alignof(std::max_align_t)) noexcept
    {
        if (base_ == nullptr) {
            return nullptr;
        }

        // Each thread claims a region on first allocation via thread_local state
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
        thread_local size_t tl_region_idx = SIZE_MAX;
        // NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
        thread_local RegionAllocator* tl_owner = nullptr;

        if (tl_owner != this) {
            tl_region_idx = next_thread_idx_.fetch_add(1, std::memory_order_relaxed);
            tl_owner = this;
        }

        if (tl_region_idx >= num_threads_) {
            return nullptr; // Too many threads; fall back to malloc
        }

        // Each thread has exclusive access to its region, so load/store is sufficient.
        char* region_base = base_ + (tl_region_idx * region_size_);
        size_t off = thread_regions_[tl_region_idx].offset.load(std::memory_order_relaxed);

        // Align the current offset to the requested alignment
        uintptr_t addr = reinterpret_cast<uintptr_t>(region_base + off);
        uintptr_t aligned_addr = (addr + alignment - 1) & ~(alignment - 1);
        size_t aligned_off = static_cast<size_t>(aligned_addr - reinterpret_cast<uintptr_t>(region_base));

        // Round up size to alignment for clean subsequent allocations
        size = (size + alignment - 1) & ~(alignment - 1);

        if (aligned_off + size > region_size_) {
            return nullptr; // Region exhausted; fall back
        }

        thread_regions_[tl_region_idx].offset.store(aligned_off + size, std::memory_order_relaxed);
        return reinterpret_cast<void*>(aligned_addr);
    }

    bool contains(const void* ptr) const noexcept
    {
        const char* p = static_cast<const char*>(ptr);
        return base_ != nullptr && p >= base_ && p < base_ + total_size_;
    }
};

// Global active region allocator. Atomic for thread-safe reads.
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
inline std::atomic<RegionAllocator*> g_region_allocator{ nullptr };

/**
 * @brief STL-compatible allocator that bump-allocates from the active region.
 *
 * When a region is active (g_region_allocator != nullptr), allocations come from the region.
 * When no region is active, falls back to malloc.
 * Deallocation is always a no-op: region memory is freed in bulk when the guard destructs.
 */
template <typename T> struct region_stl_allocator {
    using value_type = T;

    region_stl_allocator() noexcept = default;
    template <typename U> region_stl_allocator(const region_stl_allocator<U>& /*unused*/) noexcept {}

    T* allocate(size_t n)
    {
        constexpr size_t alignment = alignof(T);
        const size_t total_bytes = n * sizeof(T);

        RegionAllocator* ra = g_region_allocator.load(std::memory_order_acquire);
        if (ra != nullptr) {
            void* ptr = ra->allocate(total_bytes, alignment);
            if (ptr != nullptr) {
                return static_cast<T*>(ptr);
            }
        }
        // Fallback to aligned allocation
        // aligned_alloc requires size to be a multiple of alignment
        size_t alloc_size = (total_bytes + alignment - 1) & ~(alignment - 1);
        // NOLINTNEXTLINE(cppcoreguidelines-no-malloc)
        void* ptr = aligned_alloc(alignment, alloc_size);
        if (ptr == nullptr) {
            throw std::bad_alloc();
        }
        return static_cast<T*>(ptr);
    }

    void deallocate(T*, size_t) noexcept
    {
        // No-op: region memory is freed in bulk when the guard destructs.
    }

    template <typename U> bool operator==(const region_stl_allocator<U>&) const noexcept { return true; }
};

template <typename T> using region_vector = std::vector<T, region_stl_allocator<T>>;

/**
 * @brief RAII guard that activates a region allocator for the current scope.
 * Must be declared before any objects that will allocate from the region,
 * so that those objects are destroyed first (C++ reverse destruction order).
 */
struct RegionGuard {
    RegionAllocator allocator_;

    RegionGuard(size_t num_threads, size_t alloc_per_thread) noexcept
        : allocator_(num_threads, alloc_per_thread)
    {
        RegionAllocator* expected = nullptr;
        [[maybe_unused]] bool ok =
            g_region_allocator.compare_exchange_strong(expected, &allocator_, std::memory_order_release);
        assert(ok && "Nested region allocators are not allowed");
    }

    ~RegionGuard() { g_region_allocator.store(nullptr, std::memory_order_release); }

    RegionGuard(const RegionGuard&) = delete;
    RegionGuard& operator=(const RegionGuard&) = delete;
    RegionGuard(RegionGuard&&) = delete;
    RegionGuard& operator=(RegionGuard&&) = delete;
};

} // namespace bb

// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define BB_CONCAT_IMPL_(a, b) a##b
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define BB_CONCAT_(a, b) BB_CONCAT_IMPL_(a, b)
// NOLINTNEXTLINE(cppcoreguidelines-macro-usage)
#define BB_USE_REGION_ALLOCATOR(num_threads, alloc_per_thread)                                                         \
    ::bb::RegionGuard BB_CONCAT_(_bb_region_guard_, __LINE__)(num_threads, alloc_per_thread)
