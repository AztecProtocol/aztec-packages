#include "parallel_for_work_stealing.hpp"
#include "thread.hpp"
#include <atomic>
#include <cmath>
#include <chrono>
#include <gtest/gtest.h>
#include <vector>

using namespace bb;

class ParallelForWorkStealingTest : public ::testing::Test {
  protected:
    void SetUp() override {}
};

TEST_F(ParallelForWorkStealingTest, BasicFunctionality)
{
    const size_t num_iterations = 1000;
    std::atomic<size_t> counter{ 0 };

    parallel_for_work_stealing(num_iterations, [&counter](size_t) { counter.fetch_add(1); });

    EXPECT_EQ(counter.load(), num_iterations);
}

TEST_F(ParallelForWorkStealingTest, CorrectIndices)
{
    const size_t num_iterations = 100;
    std::vector<std::atomic<bool>> visited(num_iterations);

    parallel_for_work_stealing(num_iterations, [&visited](size_t i) {
        bool expected = false;
        EXPECT_TRUE(visited[i].compare_exchange_strong(expected, true));
    });

    for (size_t i = 0; i < num_iterations; ++i) {
        EXPECT_TRUE(visited[i].load());
    }
}

TEST_F(ParallelForWorkStealingTest, ImbalancedWorkload)
{
    const size_t num_iterations = 1000;
    std::vector<size_t> work_done(num_iterations);

    // Create imbalanced workload
    std::vector<size_t> workloads(num_iterations);
    for (size_t i = 0; i < num_iterations; ++i) {
        workloads[i] = (i < 10) ? 10000 : 100; // First 10 tasks are heavy
    }

    parallel_for_work_stealing(num_iterations, [&work_done, &workloads](size_t i) {
        volatile double result = 1.0;
        for (size_t j = 0; j < workloads[i]; ++j) {
            result = result * 1.0001 + 0.0001;
        }
        work_done[i] = workloads[i];
    });

    // Verify all work was done
    for (size_t i = 0; i < num_iterations; ++i) {
        EXPECT_EQ(work_done[i], workloads[i]);
    }
}

TEST_F(ParallelForWorkStealingTest, SmallWorkloadFallback)
{
    const size_t num_iterations = 50; // Below default min_work_size
    std::atomic<size_t> counter{ 0 };

    WorkStealingSettings settings(10, 100); // min_work_size = 100

    parallel_for_work_stealing(
        num_iterations, [&counter](size_t) { counter.fetch_add(1); }, settings);

    EXPECT_EQ(counter.load(), num_iterations);
}

TEST_F(ParallelForWorkStealingTest, CustomChunkSize)
{
    const size_t num_iterations = 1000;
    std::atomic<size_t> counter{ 0 };

    WorkStealingSettings settings(10, 50); // chunk_size = 10

    parallel_for_work_stealing(
        num_iterations, [&counter](size_t) { counter.fetch_add(1); }, settings);

    EXPECT_EQ(counter.load(), num_iterations);
}

TEST_F(ParallelForWorkStealingTest, StressTest)
{
    const size_t num_iterations = 100000;
    std::vector<std::atomic<size_t>> counters(get_num_cpus());

    parallel_for_work_stealing(num_iterations, [&counters](size_t i) {
        // Each thread increments its own counter to reduce contention
        size_t thread_id = i % counters.size();
        counters[thread_id].fetch_add(1);
    });

    size_t total = 0;
    for (auto& counter : counters) {
        total += counter.load();
    }

    EXPECT_EQ(total, num_iterations);
}

TEST_F(ParallelForWorkStealingTest, EmptyWork)
{
    const size_t num_iterations = 0;
    bool called = false;

    parallel_for_work_stealing(num_iterations, [&called](size_t) { called = true; });

    EXPECT_FALSE(called);
}

TEST_F(ParallelForWorkStealingTest, SingleIteration)
{
    const size_t num_iterations = 1;
    std::atomic<size_t> counter{ 0 };
    std::atomic<size_t> index_sum{ 0 };

    parallel_for_work_stealing(num_iterations, [&counter, &index_sum](size_t i) {
        counter.fetch_add(1);
        index_sum.fetch_add(i);
    });

    EXPECT_EQ(counter.load(), 1);
    EXPECT_EQ(index_sum.load(), 0);
}

// Performance comparison test (disabled by default)
TEST_F(ParallelForWorkStealingTest, DISABLED_PerformanceComparison)
{
    const size_t num_iterations = 1000000;
    std::vector<double> results(num_iterations);

    // Test work stealing
    auto start = std::chrono::high_resolution_clock::now();

    parallel_for_work_stealing(num_iterations, [&results](size_t i) {
        // Simulate computation
        double value = static_cast<double>(i);
        for (int j = 0; j < 100; ++j) {
            value = std::sin(value) + std::cos(value);
        }
        results[i] = value;
    });

    auto end = std::chrono::high_resolution_clock::now();
    auto ws_duration = std::chrono::duration<double, std::milli>(end - start).count();

    // Test regular parallel_for
    start = std::chrono::high_resolution_clock::now();

    parallel_for(num_iterations, [&results](size_t i) {
        // Same computation
        double value = static_cast<double>(i);
        for (int j = 0; j < 100; ++j) {
            value = std::sin(value) + std::cos(value);
        }
        results[i] = value;
    });

    end = std::chrono::high_resolution_clock::now();
    auto pf_duration = std::chrono::duration<double, std::milli>(end - start).count();

    std::cout << "Work stealing time: " << ws_duration << " ms\n";
    std::cout << "Regular parallel_for time: " << pf_duration << " ms\n";
    std::cout << "Speedup: " << pf_duration / ws_duration << "x\n";
}
