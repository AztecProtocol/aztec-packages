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

// Test nested parallel_for
TEST_F(ThreadTest, NestedParallelFor)
{
    constexpr size_t outer_iterations = 4;
    constexpr size_t inner_iterations = 10;

    std::vector<std::vector<char>> flags(outer_iterations, std::vector<char>(inner_iterations, 0));

    parallel_for(outer_iterations,
                 [&](size_t i) { parallel_for(inner_iterations, [&](size_t j) { flags[i][j] = 1; }); });

    // All iterations should have been executed
    for (size_t i = 0; i < outer_iterations; ++i) {
        for (size_t j = 0; j < inner_iterations; ++j) {
            EXPECT_TRUE(flags[i][j]);
        }
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

// Test main thread concurrency isolation and nested concurrency
TEST_F(ThreadTest, ConcurrencyIsolation)
{
    set_parallel_for_concurrency(8);

    // Main thread concurrency should be preserved before/after parallel_for
    size_t cpus_before = get_num_cpus();
    EXPECT_EQ(cpus_before, 8);

    std::vector<std::atomic<size_t>> observed_inner_cpus(4);

    parallel_for(4, [&](size_t outer_idx) {
        // Worker threads get their own thread_local concurrency set by the pool
        // With 8 CPUs and 4 outer tasks, each gets at least 2 CPUs for inner work
        size_t inner_cpus = get_num_cpus();
        observed_inner_cpus[outer_idx].store(inner_cpus);

        // Run a nested parallel_for to verify inner concurrency works
        parallel_for(10, [](size_t) {});
    });

    // All inner parallel_for calls should see at least 2 CPUs
    for (size_t i = 0; i < 4; ++i) {
        EXPECT_GE(observed_inner_cpus[i].load(), 2);
    }

    // Main thread concurrency should be unchanged
    size_t cpus_after = get_num_cpus();
    EXPECT_EQ(cpus_after, 8);
    EXPECT_EQ(cpus_before, cpus_after);
}
} // namespace bb
