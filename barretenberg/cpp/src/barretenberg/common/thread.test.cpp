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

// Test nested parallel_for thread count
TEST_F(ThreadTest, NestedThreadCount)
{
    set_parallel_for_concurrency(8);

    std::atomic<size_t> outer_unique_threads{ 0 };
    std::atomic<size_t> max_inner_unique_threads{ 0 };
    std::mutex outer_mutex;
    std::set<std::thread::id> outer_thread_ids;

    constexpr size_t outer_iterations = 4;
    constexpr size_t inner_iterations = 100;

    parallel_for(outer_iterations, [&](size_t) {
        // Track outer thread
        {
            std::lock_guard<std::mutex> lock(outer_mutex);
            outer_thread_ids.insert(std::this_thread::get_id());
        }

        // Track inner threads
        std::mutex inner_mutex;
        std::set<std::thread::id> inner_thread_ids;

        parallel_for(inner_iterations, [&](size_t) {
            std::lock_guard<std::mutex> lock(inner_mutex);
            inner_thread_ids.insert(std::this_thread::get_id());
            std::this_thread::sleep_for(std::chrono::microseconds(100));
        });

        // Update max inner thread count
        size_t inner_count = inner_thread_ids.size();
        size_t current_max = max_inner_unique_threads.load();
        while (inner_count > current_max && !max_inner_unique_threads.compare_exchange_weak(current_max, inner_count)) {
            // Retry until we successfully update or someone else set a higher value
        }
    });

    outer_unique_threads = outer_thread_ids.size();

    // Outer should use available CPUs (up to 8)
    EXPECT_GE(outer_unique_threads, 4);
    EXPECT_LE(outer_unique_threads, 9); // Main thread + 8 workers

    // Inner parallel_for runs sequentially within each outer thread
    // So each inner parallel_for should see all CPUs available
    EXPECT_GE(max_inner_unique_threads, 4);
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

// Test calculate_thread_data bounds
TEST_F(ThreadTest, CalculateThreadDataBounds)
{
    set_parallel_for_concurrency(4);

    auto data = calculate_thread_data(100);

    // Should create some threads (at least 1)
    EXPECT_GE(data.num_threads, 1);
    EXPECT_LE(data.num_threads, 4);

    // Vectors should be sized correctly
    EXPECT_EQ(data.start.size(), data.num_threads);
    EXPECT_EQ(data.end.size(), data.num_threads);

    // First thread starts at 0
    EXPECT_EQ(data.start[0], 0);

    // Last thread ends at num_iterations
    EXPECT_EQ(data.end[data.num_threads - 1], 100);

    // Bounds should be contiguous and non-overlapping
    for (size_t i = 0; i < data.num_threads - 1; ++i) {
        EXPECT_EQ(data.end[i], data.start[i + 1]);
        EXPECT_LT(data.start[i], data.end[i]);
    }
    EXPECT_LT(data.start[data.num_threads - 1], data.end[data.num_threads - 1]);
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
