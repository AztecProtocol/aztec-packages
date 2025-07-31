// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], date: YYYY-MM-DD }
// external_1:  { status: not started, auditors: [], date: YYYY-MM-DD }
// external_2:  { status: not started, auditors: [], date: YYYY-MM-DD }
// =====================

#pragma once

#include "barretenberg/common/slab_allocator.hpp"
#include <unordered_map>

// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
extern bool slow_low_memory;

#ifndef __wasm__
namespace bb {

struct FileBackedAllocation {
    void* ptr;
    int fd;
    std::size_t size_bytes;
    std::string filename;

    FileBackedAllocation() = default;

    FileBackedAllocation(std::size_t size_bytes, const std::string& filename_prefix);
    FileBackedAllocation(const FileBackedAllocation&) = delete;            // delete copy constructor
    FileBackedAllocation& operator=(const FileBackedAllocation&) = delete; // delete copy assignment

    FileBackedAllocation(const FileBackedAllocation&&) = delete; // delete copy constructor
    FileBackedAllocation& operator=(FileBackedAllocation&& other) noexcept;

    ~FileBackedAllocation() noexcept;
};

template <typename T> class SlabOrFileBackedAllocator {
  public:
    using value_type = T;
    using pointer = T*;
    using const_pointer = const T*;
    using size_type = std::size_t;

    template <class U> struct rebind {
        using other = SlabOrFileBackedAllocator<U>;
    };

    SlabOrFileBackedAllocator() = default;

    T* allocate(std::size_t n)
    {
        if (slow_low_memory) {
            size_t size_bytes = n * sizeof(T);
            FileBackedAllocation allocation(size_bytes, "allocator-mmap-");

            // Cleanup: store file info for deallocation
            void* ptr = allocation.ptr;
            allocations[ptr] = std::move(allocation);
            return static_cast<T*>(ptr);
        }
        return slab_allocator.allocate(n);
    }

    void deallocate(T* p, std::size_t /*unused*/) noexcept
    {
        if (slow_low_memory) {
            allocations.erase(p);
        } else {
            slab_allocator.deallocate(p, 0);
        }
    }

  private:
    static inline std::unordered_map<void*, FileBackedAllocation> allocations;
    ContainerSlabAllocator<T> slab_allocator;
};

template <typename T, typename U>
bool operator==(const SlabOrFileBackedAllocator<T>& /*unused*/, const SlabOrFileBackedAllocator<U>& /*unused*/) noexcept
{
    return true;
}

template <typename T, typename U>
bool operator!=(const SlabOrFileBackedAllocator<T>& /*unused*/, const SlabOrFileBackedAllocator<U>& /*unused*/) noexcept
{
    return false;
}
} // namespace bb
#endif // __wasm__
