#include "../mem.hpp"

#ifdef TRACY_MEMORY

void* operator new(std::size_t count)
{
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    void* ptr = malloc(count);
    // NOLINTEND(cppcoreguidelines-no-malloc)
    TRACY_ALLOC(ptr, count);
    return ptr;
}

void* operator new[](std::size_t count)
{
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    void* ptr = malloc(count);
    // NOLINTEND(cppcoreguidelines-no-malloc)
    TRACY_ALLOC(ptr, count);
    return ptr;
}

void operator delete(void* ptr) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

void operator delete(void* ptr, std::size_t) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

void operator delete[](void* ptr) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

void operator delete[](void* ptr, std::size_t) noexcept
{
    TRACY_FREE(ptr);
    // NOLINTBEGIN(cppcoreguidelines-no-malloc)
    free(ptr);
    // NOLINTEND(cppcoreguidelines-no-malloc)
}

// C++17 aligned new
void* operator new(std::size_t size, std::align_val_t alignment)
{
    void* ptr = aligned_alloc(static_cast<std::size_t>(alignment), size);
    TRACY_ALLOC(ptr, size);
    return ptr;
}

void* operator new[](std::size_t size, std::align_val_t alignment)
{
    void* ptr = aligned_alloc(static_cast<std::size_t>(alignment), size);
    TRACY_ALLOC(ptr, size);
    return ptr;
}

void operator delete(void* ptr, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

void operator delete(void* ptr, std::size_t, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

void operator delete[](void* ptr, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

void operator delete[](void* ptr, std::size_t, std::align_val_t) noexcept
{
    TRACY_FREE(ptr);
    aligned_free(ptr);
}

#elif defined(BUMP_ALLOCATOR)

// Experimental thread-local bump pointer allocator for profiling.
// Preallocates 1GB of virtual address space per thread via mmap and
// never frees. Comparing bb performance with this allocator vs the
// default reveals total time lost to malloc/free.

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <new>
#include <sys/mman.h>

namespace {

constexpr std::size_t ARENA_SIZE = std::size_t(1) << 30; // 1 GB

struct BumpArena {
    char* base = nullptr;
    std::size_t offset = 0;

    BumpArena()
    {
        base = static_cast<char*>(
            mmap(nullptr, ARENA_SIZE, PROT_READ | PROT_WRITE, MAP_PRIVATE | MAP_ANONYMOUS | MAP_NORESERVE, -1, 0));
        if (base == MAP_FAILED) {
            std::fprintf(stderr, "BumpArena: mmap of %zu bytes failed\n", ARENA_SIZE);
            std::abort();
        }
    }

    void* allocate(std::size_t size, std::size_t alignment)
    {
        // Align offset up
        std::size_t aligned = (offset + alignment - 1) & ~(alignment - 1);
        if (aligned + size > ARENA_SIZE) {
            std::fprintf(stderr, "BumpArena: exhausted %zu bytes (requested %zu, alignment %zu)\n", ARENA_SIZE, size, alignment);
            std::abort();
        }
        void* ptr = base + aligned;
        offset = aligned + size;
        return ptr;
    }
};

thread_local BumpArena arena; // NOLINT

} // namespace

void* operator new(std::size_t count)
{
    return arena.allocate(count, alignof(std::max_align_t));
}

void* operator new[](std::size_t count)
{
    return arena.allocate(count, alignof(std::max_align_t));
}

void* operator new(std::size_t size, std::align_val_t alignment)
{
    return arena.allocate(size, static_cast<std::size_t>(alignment));
}

void* operator new[](std::size_t size, std::align_val_t alignment)
{
    return arena.allocate(size, static_cast<std::size_t>(alignment));
}

void operator delete(void*) noexcept {}
void operator delete(void*, std::size_t) noexcept {}
void operator delete[](void*) noexcept {}
void operator delete[](void*, std::size_t) noexcept {}
void operator delete(void*, std::align_val_t) noexcept {}
void operator delete(void*, std::size_t, std::align_val_t) noexcept {}
void operator delete[](void*, std::align_val_t) noexcept {}
void operator delete[](void*, std::size_t, std::align_val_t) noexcept {}

#else
void __ensure_object_file_not_empty_of_symbols() {} // NOLINT
#endif
