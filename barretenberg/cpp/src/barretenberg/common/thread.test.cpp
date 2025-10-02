#include "thread.hpp"
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
        set_hardware_concurrency(original_concurrency);
    }

    size_t original_concurrency;
};

// Test basic parallel_for functionality
TEST_F(ThreadTest, BasicParallelFor)
{
    constexpr size_t num_iterations = 100;
    std::vector<bool> flags(num_iterations, false);

    parallel_for(num_iterations, [&](size_t i) { flags[i] = true; });

    // All iterations should have been executed
    for (size_t i = 0; i < num_iterations; ++i) {
        EXPECT_TRUE(flags[i]);
    }
}

// Test that parallel_for_outer works the same as parallel_for for non-nested case
TEST_F(ThreadTest, ParallelForOuterBasic)
{
    constexpr size_t num_iterations = 100;
    std::vector<bool> flags(num_iterations, false);

    parallel_for_outer(num_iterations, [&](size_t i) { flags[i] = true; });

    // All iterations should have been executed
    for (size_t i = 0; i < num_iterations; ++i) {
        EXPECT_TRUE(flags[i]);
    }
}

// Test nested parallel_for with parallel_for_outer
TEST_F(ThreadTest, NestedParallelForWithOuter)
{
    constexpr size_t outer_iterations = 4;
    constexpr size_t inner_iterations = 10;

    std::vector<std::vector<bool>> flags(outer_iterations, std::vector<bool>(inner_iterations, false));

    parallel_for_outer(outer_iterations,
                       [&](size_t i) { parallel_for(inner_iterations, [&](size_t j) { flags[i][j] = true; }); });

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
    set_hardware_concurrency(8);

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
    set_hardware_concurrency(8);

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

// Test that correct number of threads are actually created
TEST_F(ThreadTest, ActualThreadCount)
{
    set_hardware_concurrency(4);

    std::mutex thread_ids_mutex;
    std::set<std::thread::id> thread_ids;

    constexpr size_t num_iterations = 100;

    parallel_for(num_iterations, [&](size_t) {
        std::thread::id tid = std::this_thread::get_id();
        {
            std::lock_guard<std::mutex> lock(thread_ids_mutex);
            thread_ids.insert(tid);
        }
        // Sleep a bit to ensure work is spread across threads
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    });

    size_t unique_thread_count = thread_ids.size();

    // With 4 CPUs and 100 iterations, we should use 4 workers + 1 main thread = 4 threads total
    // (The implementation uses get_num_cpus() - 1 workers, plus main thread participates)
    EXPECT_EQ(unique_thread_count, 4);
}

// Test nested parallel_for thread count
TEST_F(ThreadTest, NestedThreadCount)
{
    set_hardware_concurrency(8);

    std::atomic<size_t> outer_unique_threads{ 0 };
    std::atomic<size_t> max_inner_unique_threads{ 0 };
    std::mutex outer_mutex;
    std::set<std::thread::id> outer_thread_ids;

    constexpr size_t outer_iterations = 4;
    constexpr size_t inner_iterations = 100;

    parallel_for_outer(outer_iterations, [&](size_t) {
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
    std::atomic<size_t> counter{ 0 };

    parallel_for(0, [&](size_t) { counter++; });

    EXPECT_EQ(counter, 0);
}

// Test parallel_for with one iteration
TEST_F(ThreadTest, OneIteration)
{
    std::atomic<size_t> counter{ 0 };

    parallel_for(1, [&](size_t i) {
        counter++;
        EXPECT_EQ(i, 0);
    });

    EXPECT_EQ(counter, 1);
}

// Test calculate_thread_data bounds
TEST_F(ThreadTest, CalculateThreadDataBounds)
{
    set_hardware_concurrency(4);

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
}

// Test parallel_for_range
TEST_F(ThreadTest, ParallelForRange)
{
    constexpr size_t num_points = 100;
    std::vector<bool> flags(num_points, false);

    parallel_for_range(num_points, [&](size_t start, size_t end) {
        for (size_t i = start; i < end; ++i) {
            flags[i] = true;
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
    std::vector<bool> flags(num_points, false);

    std::atomic<size_t> call_count{ 0 };

    // Set threshold to 10, so with exactly 10 points it should run sequentially (1 call)
    parallel_for_range(
        num_points,
        [&](size_t start, size_t end) {
            call_count++;
            for (size_t i = start; i < end; ++i) {
                flags[i] = true;
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
    set_hardware_concurrency(1);
    EXPECT_EQ(get_num_cpus(), 1);

    set_hardware_concurrency(4);
    EXPECT_EQ(get_num_cpus(), 4);

    set_hardware_concurrency(16);
    EXPECT_EQ(get_num_cpus(), 16);

    set_hardware_concurrency(128);
    EXPECT_EQ(get_num_cpus(), 128);
}

// Test get_num_cpus_pow2
TEST_F(ThreadTest, HardwareConcurrencyPow2)
{
    set_hardware_concurrency(1);
    EXPECT_EQ(get_num_cpus_pow2(), 1);

    set_hardware_concurrency(4);
    EXPECT_EQ(get_num_cpus_pow2(), 4);

    set_hardware_concurrency(5);
    EXPECT_EQ(get_num_cpus_pow2(), 4); // Round down to power of 2

    set_hardware_concurrency(7);
    EXPECT_EQ(get_num_cpus_pow2(), 4); // Round down to power of 2

    set_hardware_concurrency(8);
    EXPECT_EQ(get_num_cpus_pow2(), 8);

    set_hardware_concurrency(15);
    EXPECT_EQ(get_num_cpus_pow2(), 8); // Round down to power of 2

    set_hardware_concurrency(16);
    EXPECT_EQ(get_num_cpus_pow2(), 16);
}

} // namespace bb
