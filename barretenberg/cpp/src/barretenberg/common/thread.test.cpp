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

// Test that spawned threads can use parallel_for with set_parallel_for_concurrency
TEST_F(ThreadTest, SpawnedThreadsCanUseParallelFor)
{
    set_parallel_for_concurrency(8);

    constexpr size_t num_outer = 2;
    constexpr size_t num_inner = 100;
    std::vector<std::vector<char>> results(num_outer, std::vector<char>(num_inner, 0));

    auto worker = [&](size_t outer_idx) {
        set_parallel_for_concurrency(4);
        parallel_for(num_inner, [&](size_t inner_idx) { results[outer_idx][inner_idx] = 1; });
    };

    std::vector<std::thread> threads;
    for (size_t i = 0; i < num_outer; ++i) {
        threads.emplace_back(worker, i);
    }
    for (auto& t : threads) {
        t.join();
    }

    // Verify all work completed
    for (size_t i = 0; i < num_outer; ++i) {
        for (size_t j = 0; j < num_inner; ++j) {
            EXPECT_TRUE(results[i][j]);
        }
    }
}

// Many back-to-back parallel_for calls of varying size and duration, including empty iterations and calls short enough
// that the caller finishes before the workers wake up. Every iteration must run exactly once per call.
TEST_F(ThreadTest, ManyConsecutiveParallelFors)
{
    constexpr size_t num_calls = 20000;
    constexpr size_t max_iterations = 37;
    std::vector<std::atomic<size_t>> counts(max_iterations);
    size_t expected_total = 0;
    for (size_t call = 0; call < num_calls; ++call) {
        const size_t num_iterations = call % max_iterations;
        // Every 1000th call does enough work per iteration that idle threads fall back to sleeping.
        const size_t work = (call % 1000 == 0) ? 200000 : (call % 7);
        parallel_for(num_iterations, [&](size_t i) {
            volatile size_t sink = 0;
            for (size_t j = 0; j < work; ++j) {
                sink = sink + j;
            }
            counts[i].fetch_add(1, std::memory_order_relaxed);
        });
        expected_total += num_iterations;
        if (call % 5000 == 0) {
            // Leave the pool idle long enough for the workers to block.
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        }
    }
    size_t total = 0;
    for (size_t i = 0; i < max_iterations; ++i) {
        total += counts[i].load();
    }
    EXPECT_EQ(total, expected_total);
    for (size_t i = 0; i + 1 < max_iterations; ++i) {
        // Iteration i runs in every call with num_iterations > i.
        size_t expected = 0;
        for (size_t call = 0; call < num_calls; ++call) {
            expected += (call % max_iterations > i) ? 1 : 0;
        }
        EXPECT_EQ(counts[i].load(), expected);
    }
}
} // namespace bb
