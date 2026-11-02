#include "mem.hpp"
#include <cstring>
#include <gtest/gtest.h>

namespace {
// Keeps the allocations below observable, so the compiler cannot pair and elide them.
void* volatile sink = nullptr;

void* touched_malloc(size_t bytes)
{
    void* ptr = std::malloc(bytes);
    std::memset(ptr, 1, bytes);
    sink = ptr;
    return ptr;
}
} // namespace

/**
 * @brief After configure_heap_for_low_memory, freeing a large mapped buffer does not move later buffers onto the heap.
 * @details Without fixed thresholds glibc raises its mmap threshold to the freed buffer's size, so the next 2 MiB
 * allocation is carved from the heap and stays resident after it is freed.
 */
TEST(HeapConfiguration, FreedLargeBufferDoesNotRaiseMmapThreshold)
{
#if defined(__GLIBC__)
    constexpr size_t MiB = size_t{ 1 } << 20;
    bb::configure_heap_for_low_memory();

    std::free(touched_malloc(16 * MiB));

    const size_t mapped_before = mallinfo2().hblkhd;
    void* buffer = touched_malloc(2 * MiB);
    const size_t mapped_after = mallinfo2().hblkhd;
    std::free(buffer);

    EXPECT_GE(mapped_after - mapped_before, 2 * MiB);
#else
    GTEST_SKIP() << "glibc only";
#endif
}
