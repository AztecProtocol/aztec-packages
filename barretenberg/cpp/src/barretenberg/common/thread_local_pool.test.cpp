#include "thread.hpp"
#include <atomic>
#include <gtest/gtest.h>
#include <thread>
#include <vector>

namespace bb {

class ThreadLocalPoolTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        original_concurrency = get_num_cpus();
    }

    void TearDown() override
    {
        set_parallel_for_concurrency(original_concurrency);
    }

    size_t original_concurrency;
};

#ifndef __wasm__

// Test 1: Verify thread-local storage works correctly
TEST_F(ThreadLocalPoolTest, ThreadLocalIsolation)
{
    set_parallel_for_concurrency(8);

    const size_t threads_per_task = 2;
    const size_t num_outer_threads = 4;

    std::vector<std::atomic<size_t>> observed_cpus(num_outer_threads);
    std::atomic<size_t> current_thread{0};

    auto worker = [&]() {
        // Simulate what parallel_for_nested would do
        thread_local size_t local_cpus = threads_per_task;

        size_t thread_idx;
        while ((thread_idx = current_thread.fetch_add(1)) < num_outer_threads) {
            // Store what this thread observes
            observed_cpus[thread_idx] = local_cpus;
        }
    };

    std::vector<std::thread> threads;
    for (size_t i = 0; i < num_outer_threads; ++i) {
        threads.emplace_back(worker);
    }

    for (auto& t : threads) {
        t.join();
    }

    // Each thread should have seen its own thread-local value
    for (size_t i = 0; i < num_outer_threads; ++i) {
        EXPECT_EQ(observed_cpus[i], threads_per_task);
    }

    // Main thread should still see original value
    EXPECT_EQ(get_num_cpus(), 8);
}

// Test 2: Spawn threads and use parallel_for within each
TEST_F(ThreadLocalPoolTest, SpawnThreadsThenParallelFor)
{
    set_parallel_for_concurrency(8);

    const size_t num_outer_tasks = 4;
    const size_t inner_iterations = 100;

    std::vector<std::vector<char>> completed(num_outer_tasks, std::vector<char>(inner_iterations, 0));

    std::atomic<size_t> current_task{ 0 };

    auto outer_worker = [&]() {
        size_t task_idx;
        while ((task_idx = current_task.fetch_add(1)) < num_outer_tasks) {
            // Each spawned thread calls parallel_for
            parallel_for(inner_iterations, [&](size_t inner_idx) { completed[task_idx][inner_idx] = 1; });
        }
    };

    // Spawn threads directly
    std::vector<std::thread> threads;
    for (size_t i = 0; i < 2; ++i) {
        threads.emplace_back(outer_worker);
    }

    for (auto& t : threads) {
        t.join();
    }

    // Verify all iterations completed
    for (size_t i = 0; i < num_outer_tasks; ++i) {
        for (size_t j = 0; j < inner_iterations; ++j) {
            EXPECT_TRUE(completed[i][j]) << "Task [" << i << "][" << j << "] not completed";
        }
    }
}

// Test 3: Verify heuristic allocation formula
TEST_F(ThreadLocalPoolTest, HeuristicAllocation)
{
    struct TestCase {
        size_t total_cpus;
        size_t num_tasks;
        size_t expected_threads_per_task;
        size_t expected_outer_threads;
    };

    std::vector<TestCase> cases = {
        { 8, 8, 2, 8 },   // 8 VKs on 8 cores → 8×2 (actual=8, inner=max(8/8*2, 2)=2)
        { 8, 4, 4, 4 },   // 4 VKs on 8 cores → 4×4 (actual=4, inner=max(8/4*2, 2)=4)
        { 8, 2, 8, 2 },   // 2 VKs on 8 cores → 2×8 (actual=2, inner=min(8, 8/2*2)=8)
        { 8, 1, 8, 1 },   // 1 VK on 8 cores → 1×8 (actual=1, inner=min(8, 8/1*2)=8)
        { 16, 8, 4, 8 },  // 8 VKs on 16 cores → 8×4 (actual=8, inner=max(16/8*2, 2)=4)
        { 16, 2, 16, 2 }, // 2 VKs on 16 cores → 2×16 (actual=2, inner=min(16, 16/2*2)=16)
        { 16, 1, 16, 1 }, // 1 VK on 16 cores → 1×16 (actual=1, inner=min(16, 16/1*2)=16)
        { 8, 16, 2, 8 },  // 16 VKs on 8 cores → 8×2 (actual=8, inner=max(8/8*2, 2)=2)
        { 4, 8, 2, 4 },   // 8 VKs on 4 cores → 4×2 (actual=4, inner=max(4/4*2, 2)=2)
        { 32, 4, 16, 4 }, // 4 VKs on 32 cores → 4×16 (actual=4, inner=min(32, 32/4*2)=16)
    };

    for (const auto& tc : cases) {
        // Heuristic:
        // - actual_tasks = min(num_tasks, get_num_cpus())
        // - threads_per_task = min(get_num_cpus(), max(2, get_num_cpus() / actual_tasks * 2))
        size_t actual_tasks = std::min(tc.num_tasks, tc.total_cpus);
        size_t threads_per_task =
            std::min(tc.total_cpus, std::max(size_t{ 2 }, tc.total_cpus / actual_tasks * 2));
        size_t outer_threads = actual_tasks;

        EXPECT_EQ(threads_per_task, tc.expected_threads_per_task)
            << "CPUs=" << tc.total_cpus << ", Tasks=" << tc.num_tasks;
        EXPECT_EQ(outer_threads, tc.expected_outer_threads)
            << "CPUs=" << tc.total_cpus << ", Tasks=" << tc.num_tasks;
    }
}

// Test 4: Stress test with many spawned threads using parallel_for
TEST_F(ThreadLocalPoolTest, StressTestSpawnedThreads)
{
    set_parallel_for_concurrency(8);

    const size_t num_outer_tasks = 16;
    const size_t inner_iterations = 50;

    std::atomic<size_t> total_completed{ 0 };
    std::atomic<size_t> current_task{ 0 };

    auto outer_worker = [&]() {
        size_t task_idx;
        while ((task_idx = current_task.fetch_add(1)) < num_outer_tasks) {
            std::atomic<size_t> local_completed{ 0 };

            parallel_for(inner_iterations, [&](size_t) { local_completed++; });

            EXPECT_EQ(local_completed, inner_iterations);
            total_completed += inner_iterations;
        }
    };

    // Spawn 4 threads
    std::vector<std::thread> threads;
    for (size_t i = 0; i < 4; ++i) {
        threads.emplace_back(outer_worker);
    }

    for (auto& t : threads) {
        t.join();
    }

    EXPECT_EQ(total_completed, num_outer_tasks * inner_iterations);
}

// Test 5: Verify parallel_for is thread-safe when called from multiple threads
TEST_F(ThreadLocalPoolTest, ParallelForThreadSafety)
{
    set_parallel_for_concurrency(8);

    const size_t num_spawned_threads = 4;
    std::vector<std::atomic<size_t>> counters(num_spawned_threads);

    auto worker = [&](size_t thread_idx) {
        // Each thread calls parallel_for independently
        parallel_for(100, [&](size_t) { counters[thread_idx]++; });
    };

    std::vector<std::thread> threads;
    for (size_t i = 0; i < num_spawned_threads; ++i) {
        threads.emplace_back(worker, i);
    }

    for (auto& t : threads) {
        t.join();
    }

    // Verify each thread's parallel_for completed all iterations
    for (size_t i = 0; i < num_spawned_threads; ++i) {
        EXPECT_EQ(counters[i], 100) << "Thread " << i << " did not complete all iterations";
    }
}

#endif // __wasm__

} // namespace bb
