#include "barretenberg/common/low_memory.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/scalar_multiplication/msm_batch_mem_budget.hpp"
#include "barretenberg/polynomials/backing_memory.hpp"
#include <cstdlib>
#include <gtest/gtest.h>
#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif
#if defined(__linux__)
#include <linux/magic.h>
#include <sys/vfs.h>
#endif

#if !defined(__wasm__) && !defined(_WIN32)

#if defined(__SANITIZE_ADDRESS__) || defined(__SANITIZE_THREAD__)
#define BB_TEST_MALLOC_INTERPOSED 1
#elif defined(__has_feature)
#if __has_feature(address_sanitizer) || __has_feature(thread_sanitizer) || __has_feature(memory_sanitizer)
#define BB_TEST_MALLOC_INTERPOSED 1
#endif
#endif
#ifndef BB_TEST_MALLOC_INTERPOSED
#define BB_TEST_MALLOC_INTERPOSED 0
#endif

namespace {
using FF = bb::fr;
namespace low_memory = bb::low_memory;
namespace scalar_multiplication = bb::scalar_multiplication;

// Exit codes name the first check that failed.
int on_then_off()
{
    low_memory::configure({ .mode = low_memory::Mode::On });
    if (scalar_multiplication::get_msm_batch_mem_budget() != low_memory::MSM_BATCH_MEM_BUDGET) {
        return 1;
    }
    auto during = BackingMemory<FF>::allocate(16);
    during.raw_data[0] = FF(7);
    low_memory::configure({ .mode = low_memory::Mode::Off });
    if (low_memory::enabled()) {
        return 2;
    }
    if (scalar_multiplication::get_msm_batch_mem_budget() != scalar_multiplication::DEFAULT_MSM_BATCH_MEM_BUDGET) {
        return 3;
    }
    auto after = BackingMemory<FF>::allocate(16);
    if (!during.is_file_backed() || during.raw_data[0] != FF(7)) {
        return 4;
    }
    if (after.is_file_backed()) {
        return 5;
    }
    return 0;
}

// A directory that cannot hold the files is a setup problem: the mode turns on with polynomials on the heap.
int unusable_storage_directory()
{
    const auto applied =
        low_memory::configure({ .mode = low_memory::Mode::On, .storage_directory = "/nonexistent/bb-low-memory-test" });
    if (applied.file_backed_polynomials || !low_memory::enabled()) {
        return 1;
    }
    if (scalar_multiplication::get_msm_batch_mem_budget() != low_memory::MSM_BATCH_MEM_BUDGET) {
        return 2;
    }
    auto polynomial = BackingMemory<FF>::allocate(16);
    polynomial.raw_data[15] = FF(7);
    return polynomial.is_file_backed() || polynomial.raw_data[15] != FF(7) ? 3 : 0;
}

#if defined(__linux__)
// Files on tmpfs are memory, so a directory there is as unusable as a missing one.
int tmpfs_storage_directory()
{
    return low_memory::configure({ .mode = low_memory::Mode::On, .storage_directory = "/dev/shm" })
                   .file_backed_polynomials
               ? 1
               : 0;
}
#endif
// The heap is tuned only where malloc is glibc's own; a run with tcmalloc or jemalloc preloaded, or a sanitizer runtime
// (which interposes malloc), reports false.
int heap_configured_matches_allocator()
{
#if defined(__GLIBC__) && !BB_TEST_MALLOC_INTERPOSED
    constexpr bool expected = true;
#else
    constexpr bool expected = false;
#endif
    return low_memory::configure({ .mode = low_memory::Mode::On }).heap_configured == expected ? 0 : 1;
}

// Automatic is resolved from os_proc_available_memory on iOS only; everywhere else it means off.
int automatic_off_the_phone()
{
    const auto applied = low_memory::configure({ .mode = low_memory::Mode::Automatic });
    return applied.enabled || low_memory::enabled() ? 1 : 0;
}
} // namespace

TEST(LowMemoryConfigure, AutomaticTurnsOnOnlyBelowAKnownThreshold)
{
    constexpr size_t threshold = size_t{ 1 } << 30;
    EXPECT_TRUE(low_memory::automatic_turns_on(threshold - 1, threshold));
    EXPECT_FALSE(low_memory::automatic_turns_on(threshold, threshold));
    EXPECT_FALSE(low_memory::automatic_turns_on(threshold + 1, threshold));
    // 0 is what os_proc_available_memory returns for a process without a memory limit.
    EXPECT_FALSE(low_memory::automatic_turns_on(0, threshold));
    EXPECT_FALSE(low_memory::automatic_turns_on(std::nullopt, threshold));
}

#if !(defined(__APPLE__) && TARGET_OS_IPHONE)
TEST(LowMemoryConfigureDeathTest, AutomaticIsOffOffTheIphone)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(std::_Exit(automatic_off_the_phone()), ::testing::ExitedWithCode(0), "");
}
#endif

// configure() changes process-wide allocator state, so each case runs in a child process ("threadsafe" death tests
// re-execute the binary).
TEST(LowMemoryConfigureDeathTest, OffRestoresMsmBudgetAndHeapAllocationWhileOnAllocationsStayFileBacked)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(std::_Exit(on_then_off()), ::testing::ExitedWithCode(0), "");
}

TEST(LowMemoryConfigureDeathTest, UnusableStorageDirectoryKeepsPolynomialsOnTheHeap)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(std::_Exit(unusable_storage_directory()), ::testing::ExitedWithCode(0), "");
}

#if defined(__linux__)
TEST(LowMemoryConfigureDeathTest, TmpfsStorageDirectoryKeepsPolynomialsOnTheHeap)
{
    struct statfs filesystem{};
    if (statfs("/dev/shm", &filesystem) != 0 || filesystem.f_type != TMPFS_MAGIC) {
        GTEST_SKIP() << "/dev/shm is not tmpfs here";
    }
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(std::_Exit(tmpfs_storage_directory()), ::testing::ExitedWithCode(0), "");
}
#endif

TEST(LowMemoryConfigureDeathTest, HeapConfiguredOnlyUnderGlibcMalloc)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(std::_Exit(heap_configured_matches_allocator()), ::testing::ExitedWithCode(0), "");
}

#endif
