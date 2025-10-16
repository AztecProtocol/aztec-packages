#include "thread.hpp"
#include "barretenberg/common/log.hpp"
#include <atomic>
#include <gtest/gtest.h>
#include <set>
#include <thread>

namespace bb {

class ThreadTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        // Store original concurrency for restoration
        original_concurrency = get_num_cpus();
    }

    void TearDown() override
    {
        // Restore original concurrency
        set_parallel_for_concurrency(original_concurrency);
    }

    size_t original_concurrency;
};

// Test basic parallel_for functionality
TEST_F(ThreadTest, BasicParallelFor)
{
    constexpr size_t num_iterations = 100;
    std::vector<char> flags(num_iterations, 0);

    parallel_for(num_iterations, [&](size_t i) { flags[i] = 1; });

    // All iterations should have been executed
    for (size_t i = 0; i < num_iterations; ++i) {
        EXPECT_TRUE(flags[i]);
    }
}

// Test thread count calculation
TEST_F(ThreadTest, CalculateNumThreads)
{
    set_parallel_for_concurrency(8);

    // With default min iterations per thread (16)
    // 160 iterations / 16 = 10 desired threads, min(10, 8) = 8
    EXPECT_EQ(calculate_num_threads(160), 8);

    // 64 iterations / 16 = 4 desired threads, min(4, 8) = 4
    EXPECT_EQ(calculate_num_threads(64), 4);

    // 8 iterations / 16 = 0 desired threads, but should be at least 1
    EXPECT_EQ(calculate_num_threads(8), 1);

    // Custom min iterations per thread
    // 100 iterations / 10 = 10 desired threads, min(10, 8) = 8
    EXPECT_EQ(calculate_num_threads(100, 10), 8);

    // 30 iterations / 10 = 3 desired threads, min(3, 8) = 3
    EXPECT_EQ(calculate_num_threads(30, 10), 3);
}

// Test thread count calculation with power of 2
TEST_F(ThreadTest, CalculateNumThreadsPow2)
{
    set_parallel_for_concurrency(8);

    // With default min iterations per thread (16)
    // 160 iterations / 16 = 10 desired, nearest power of 2 is 8, min(8, 8) = 8
    EXPECT_EQ(calculate_num_threads_pow2(160), 8);

    // 64 iterations / 16 = 4 desired, power of 2 is 4, min(4, 8) = 4
    EXPECT_EQ(calculate_num_threads_pow2(64), 4);

    // 96 iterations / 16 = 6 desired, nearest power of 2 is 4, min(4, 8) = 4
    EXPECT_EQ(calculate_num_threads_pow2(96), 4);

    // 8 iterations / 16 = 0 desired, should be at least 1
    EXPECT_EQ(calculate_num_threads_pow2(8), 1);
}

// Test parallel_for with zero iterations
TEST_F(ThreadTest, ZeroIterations)
{
    size_t counter = 0;

    parallel_for(0, [&](size_t) { counter++; });

    EXPECT_EQ(counter, 0);
}

// Test parallel_for with one iteration
TEST_F(ThreadTest, OneIteration)
{
    size_t counter = 0;

    parallel_for(1, [&](size_t i) {
        counter++;
        EXPECT_EQ(i, 0);
    });

    EXPECT_EQ(counter, 1);
}

// Test parallel_for_range
TEST_F(ThreadTest, ParallelForRange)
{
    constexpr size_t num_points = 100;
    std::vector<char> flags(num_points, 0);

    parallel_for_range(num_points, [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            flags[i] = 1;
        }
    });

    // All iterations should have been executed
    for (size_t i = 0; i < num_points; ++i) {
        EXPECT_TRUE(flags[i]);
    }
}

// Test parallel_for_range with threshold
TEST_F(ThreadTest, ParallelForRangeThreshold)
{
    constexpr size_t num_points = 10;
    std::vector<char> flags(num_points, 0);

    std::atomic<size_t> call_count{ 0 };

    // Set threshold to 10, so with exactly 10 points it should run sequentially (1 call)
    parallel_for_range(
        num_points,
        [&](size_t start, size_t end) {
            call_count++;
            for (size_t i = start; i < end; ++i) {
                flags[i] = 1;
            }
        },
        10);

    // All iterations should have been executed
    for (size_t i = 0; i < num_points; ++i) {
        EXPECT_TRUE(flags[i]);
    }

    // Should have been called exactly once (sequential)
    EXPECT_EQ(call_count, 1);
}

// Test get_num_cpus with different hardware concurrency values
TEST_F(ThreadTest, HardwareConcurrency)
{
    set_parallel_for_concurrency(1);
    EXPECT_EQ(get_num_cpus(), 1);

    set_parallel_for_concurrency(4);
    EXPECT_EQ(get_num_cpus(), 4);

    set_parallel_for_concurrency(16);
    EXPECT_EQ(get_num_cpus(), 16);

    set_parallel_for_concurrency(128);
    EXPECT_EQ(get_num_cpus(), 128);
}

// Test get_num_cpus_pow2
TEST_F(ThreadTest, HardwareConcurrencyPow2)
{
    set_parallel_for_concurrency(1);
    EXPECT_EQ(get_num_cpus_pow2(), 1);

    set_parallel_for_concurrency(4);
    EXPECT_EQ(get_num_cpus_pow2(), 4);

    set_parallel_for_concurrency(5);
    EXPECT_EQ(get_num_cpus_pow2(), 4); // Round down to power of 2

    set_parallel_for_concurrency(7);
    EXPECT_EQ(get_num_cpus_pow2(), 4); // Round down to power of 2

    set_parallel_for_concurrency(8);
    EXPECT_EQ(get_num_cpus_pow2(), 8);

    set_parallel_for_concurrency(15);
    EXPECT_EQ(get_num_cpus_pow2(), 8); // Round down to power of 2

    set_parallel_for_concurrency(16);
    EXPECT_EQ(get_num_cpus_pow2(), 16);
}
} // namespace bb
