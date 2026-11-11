#include "mem.hpp"
#include <array>
#include <cstring>
#include <gtest/gtest.h>
#include <limits>

namespace {
// Keeps the allocations below observable, so the compiler cannot pair and elide them.
void* volatile sink = nullptr;

// Over-aligned like bb::field, so arrays of it take the aligned operator new.
struct alignas(32) Wide {
    std::array<unsigned char, 32> bytes;
};

void* touched_malloc(size_t bytes)
{
    void* ptr = std::malloc(bytes);
    std::memset(ptr, 1, bytes);
    sink = ptr;
    return ptr;
}
} // namespace

TEST(HeapConfigurationDeathTest, AllocationFailureRetriesThroughNewHandler)
{
#if defined(__APPLE__) && !defined(TRACY_MEMORY)
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    for (bool low_memory : { false, true }) {
        for (bool aligned : { false, true }) {
            EXPECT_EXIT(
                {
                    if (low_memory) {
                        bb::configure_heap_for_low_memory();
                    }
                    std::set_new_handler([] {
                        static bool retried = false;
                        if (std::exchange(retried, true)) {
                            std::_Exit(73);
                        }
                    });
                    volatile size_t bytes = std::numeric_limits<size_t>::max() - 4095;
                    if (aligned) {
                        void* ptr = ::operator new(bytes, std::align_val_t{ 32 });
                        ::operator delete(ptr, std::align_val_t{ 32 });
                    } else {
                        void* ptr = ::operator new(bytes);
                        ::operator delete(ptr);
                    }
                    std::_Exit(1);
                },
                ::testing::ExitedWithCode(73),
                "");
        }
    }
#else
    GTEST_SKIP() << "Apple allocation replacement only";
#endif
}

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

/**
 * @brief On Apple, after configure_heap_for_low_memory a large operator new allocation is a mapping of its own rather
 * than a libmalloc block, small ones stay on the heap, and both are usable and deletable.
 */
TEST(HeapConfigurationDeathTest, LargeAllocationsAreMappedDirectlyOnApple)
{
#if defined(__APPLE__) && !defined(TRACY_MEMORY)
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(
        {
            constexpr size_t MiB = size_t{ 1 } << 20;
            auto* before = new unsigned char[2 * MiB];
            const bool before_on_heap = !bb::detail::is_directly_mapped_allocation(before);
            bb::configure_heap_for_low_memory();
            auto* large = new unsigned char[2 * MiB];
            auto* small = new unsigned char[64 * 1024];
            auto* aligned = new Wide[(2 * MiB) / sizeof(Wide)];
            std::memset(large, 1, 2 * MiB);
            const bool large_mapped = bb::detail::is_directly_mapped_allocation(large);
            const bool aligned_mapped = bb::detail::is_directly_mapped_allocation(aligned) &&
                                        reinterpret_cast<uintptr_t>(aligned) % alignof(Wide) == 0;
            const bool small_on_heap = !bb::detail::is_directly_mapped_allocation(small);
            const bool usable = large[2 * MiB - 1] == 1;
            delete[] aligned;
            delete[] small;
            delete[] large;
            delete[] before;
            std::_Exit(before_on_heap && large_mapped && aligned_mapped && small_on_heap && usable ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
#else
    GTEST_SKIP() << "Apple only";
#endif
}

/**
 * @brief A ScratchBuffer is heap memory until low memory mode configures the heap, and a mapping of its own after.
 */
TEST(ScratchBufferDeathTest, MappedDirectlyOnlyAfterLowMemoryConfiguration)
{
#if !defined(__wasm__) && !defined(_WIN32)
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(
        {
            constexpr size_t MiB = size_t{ 1 } << 20;
            const bb::ScratchBuffer before(2 * MiB);
            bb::configure_heap_for_low_memory();
            bb::ScratchBuffer after(2 * MiB);
            std::memset(after.data(), 1, after.size());
            const bool usable = static_cast<unsigned char>(after.data()[after.size() - 1]) == 1;
            std::_Exit(!before.is_mapped() && after.is_mapped() && usable ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
#else
    GTEST_SKIP() << "no anonymous mappings on this platform";
#endif
}
