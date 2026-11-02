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
 * allocation is carved from the heap and stays resident after it is freed. The check runs in a freshly started process
 * ("threadsafe" death tests re-execute the binary): glibc cannot be put back to its dynamic thresholds, so configuring
 * the test process itself would change allocation behaviour for every later test.
 */
TEST(HeapConfigurationDeathTest, FreedLargeBufferDoesNotRaiseMmapThreshold)
{
#if defined(__GLIBC__)
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(
        {
            constexpr size_t MiB = size_t{ 1 } << 20;
            bb::configure_heap_for_low_memory();

            std::free(touched_malloc(16 * MiB));

            const size_t mapped_before = mallinfo2().hblkhd;
            void* buffer = touched_malloc(2 * MiB);
            const size_t mapped_after = mallinfo2().hblkhd;
            std::free(buffer);

            std::_Exit(mapped_after - mapped_before >= 2 * MiB ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
#else
    GTEST_SKIP() << "glibc only";
#endif
}

/**
 * @brief Returning free heap memory is safe on every platform (malloc_trim on glibc, zone pressure relief on Apple, a
 * no-op elsewhere), and the heap stays usable afterwards.
 */
TEST(HeapRelease, ReleaseFreeHeapMemoryLeavesTheHeapUsable)
{
    constexpr size_t MiB = size_t{ 1 } << 20;
    std::free(touched_malloc(4 * MiB));
    bb::release_free_heap_memory();
    void* buffer = touched_malloc(4 * MiB);
    ASSERT_NE(buffer, nullptr);
    EXPECT_EQ(static_cast<const unsigned char*>(buffer)[4 * MiB - 1], 1);
    std::free(buffer);
}
