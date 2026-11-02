#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <gtest/gtest.h>
#include <string>
#include <sys/resource.h>
#include <vector>

#if !defined(__wasm__) && !defined(_WIN32)

namespace {

using FF = bb::fr;

class FileBackedMemory : public ::testing::Test {
  protected:
    void SetUp() override
    {
        saved_slow_low_memory_ = slow_low_memory;
        saved_storage_budget_ = storage_budget;
        slow_low_memory = true;
    }
    void TearDown() override
    {
        slow_low_memory = saved_slow_low_memory_;
        storage_budget = saved_storage_budget_;
    }

  private:
    bool saved_slow_low_memory_ = false;
    size_t saved_storage_budget_ = 0;
};

#if defined(__linux__)
// Size of the anonymous (copy-on-write or private) pages in the mapping that contains addr, from /proc/self/smaps.
size_t anonymous_kb_of_mapping(const void* addr)
{
    const auto target = reinterpret_cast<uintptr_t>(addr);
    std::ifstream smaps("/proc/self/smaps");
    std::string line;
    bool in_mapping = false;
    while (std::getline(smaps, line)) {
        uintptr_t start = 0;
        uintptr_t end = 0;
        if (std::sscanf(line.c_str(), "%lx-%lx ", &start, &end) == 2 && line.find(':') > line.find(' ')) {
            in_mapping = start <= target && target < end;
        } else if (in_mapping && line.rfind("Anonymous:", 0) == 0) {
            return std::stoul(line.substr(std::string("Anonymous:").size()));
        }
    }
    throw std::runtime_error("mapping not found in /proc/self/smaps");
}

// Writes through the mapping must land in the file's page cache, not in private anonymous copies.
TEST_F(FileBackedMemory, WrittenPagesAreFilePagesNotAnonymous)
{
    constexpr size_t SIZE = 4096;
    auto memory = BackingMemory<FF>::allocate(SIZE);
    ASSERT_NE(memory.file_backed, nullptr);
    for (size_t i = 0; i < SIZE; ++i) {
        memory.raw_data[i] = FF(i + 1);
    }
    EXPECT_EQ(anonymous_kb_of_mapping(memory.raw_data), 0UL);
    for (size_t i = 0; i < SIZE; ++i) {
        EXPECT_EQ(memory.raw_data[i], FF(i + 1));
    }
}
#endif

// A prover holds many file-backed polynomials at once; they must not each pin a file descriptor.
TEST_F(FileBackedMemory, LivePolynomialsDoNotHoldFileDescriptors)
{
    constexpr size_t NUM_POLYNOMIALS = 64;
    size_t open_fds = 0;
    for ([[maybe_unused]] const auto& entry : std::filesystem::directory_iterator("/dev/fd")) {
        ++open_fds;
    }
    rlimit saved{};
    ASSERT_EQ(getrlimit(RLIMIT_NOFILE, &saved), 0);
    rlimit lowered = saved;
    lowered.rlim_cur = static_cast<rlim_t>(open_fds + 8);
    ASSERT_LT(lowered.rlim_cur, NUM_POLYNOMIALS);
    ASSERT_EQ(setrlimit(RLIMIT_NOFILE, &lowered), 0);
    struct RestoreLimit {
        rlimit limit;
        ~RestoreLimit() { setrlimit(RLIMIT_NOFILE, &limit); }
    } restore{ saved };

    std::vector<BackingMemory<FF>> live;
    for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
        live.push_back(BackingMemory<FF>::allocate(16));
        ASSERT_NE(live.back().file_backed, nullptr);
        live.back().raw_data[0] = FF(i);
    }
    for (size_t i = 0; i < NUM_POLYNOMIALS; ++i) {
        EXPECT_EQ(live[i].raw_data[0], FF(i));
    }
}

TEST_F(FileBackedMemory, PolynomialCopiesAreIndependent)
{
    constexpr size_t SIZE = 1024;
    auto poly = bb::Polynomial<FF>::random(SIZE);
    auto copy = poly;
    copy.at(7) = poly[7] + FF(1);
    EXPECT_NE(copy[7], poly[7]);
    for (size_t i = 0; i < SIZE; ++i) {
        if (i != 7) {
            EXPECT_EQ(copy[i], poly[i]);
        }
    }
}

TEST_F(FileBackedMemory, ExceedingStorageBudgetFailsInsteadOfFallingBackToHeap)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    storage_budget = current_storage_usage.load() + sizeof(FF);
    EXPECT_THROW_WITH_MESSAGE(BackingMemory<FF>::allocate(2), "storage budget");
}

TEST_F(FileBackedMemory, ZeroSizeAllocationNeedsNoFile)
{
    storage_budget = 0;
    auto memory = BackingMemory<FF>::allocate(0);
    EXPECT_EQ(memory.raw_data, nullptr);
    EXPECT_EQ(memory.file_backed, nullptr);
}

TEST(HeapBackedMemory, StorageBudgetIgnoredWithoutSlowLowMemory)
{
    const bool saved_slow_low_memory = slow_low_memory;
    const size_t saved_storage_budget = storage_budget;
    slow_low_memory = false;
    storage_budget = 0;
    auto memory = BackingMemory<FF>::allocate(16);
    EXPECT_NE(memory.raw_data, nullptr);
    EXPECT_EQ(memory.file_backed, nullptr);
    slow_low_memory = saved_slow_low_memory;
    storage_budget = saved_storage_budget;
}

} // namespace

#endif

#if defined(__GLIBC__)
#include <cstdlib>
#include <cstring>
#include <malloc.h>

namespace {
// Keeps the allocations below observable, so the compiler cannot pair and elide them.
void* volatile heap_sink = nullptr;

void* touched_malloc(size_t bytes)
{
    void* ptr = std::malloc(bytes);
    std::memset(ptr, 1, bytes);
    heap_sink = ptr;
    return ptr;
}

/**
 * @brief Whether a 2 MiB buffer allocated after a 16 MiB one was freed is still mapped. With glibc's default dynamic
 * thresholds the free raises the mmap threshold to 16 MiB and the 2 MiB buffer comes from the heap.
 */
bool freed_buffers_do_not_raise_mmap_threshold()
{
    constexpr size_t MiB = size_t{ 1 } << 20;
    std::free(touched_malloc(16 * MiB));
    const size_t mapped_before = mallinfo2().hblkhd;
    void* buffer = touched_malloc(2 * MiB);
    const size_t mapped_after = mallinfo2().hblkhd;
    std::free(buffer);
    return mapped_after - mapped_before >= 2 * MiB;
}
} // namespace

// Each case runs in a freshly started process ("threadsafe" death tests re-execute the binary), so slow_low_memory is
// initialized from the environment as in production and no allocator configuration leaks into other tests.
TEST(SlowLowMemoryDeathTest, EnvironmentVariableConfiguresTheHeap)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    setenv("BB_SLOW_LOW_MEMORY", "1", /*overwrite=*/1);
    EXPECT_EXIT(std::_Exit(slow_low_memory && freed_buffers_do_not_raise_mmap_threshold() ? 0 : 1),
                ::testing::ExitedWithCode(0),
                "");
    unsetenv("BB_SLOW_LOW_MEMORY");
}

TEST(SlowLowMemoryDeathTest, SetterConfiguresTheHeap)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    EXPECT_EXIT(
        {
            set_slow_low_memory(true);
            std::_Exit(slow_low_memory && freed_buffers_do_not_raise_mmap_threshold() ? 0 : 1);
        },
        ::testing::ExitedWithCode(0),
        "");
}
#endif
