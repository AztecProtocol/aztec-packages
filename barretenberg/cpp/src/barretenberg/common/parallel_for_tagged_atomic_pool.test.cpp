#include "parallel_for_tagged_atomic_pool.hpp"
#include "barretenberg/common/thread.hpp"

#ifndef NO_MULTITHREADING
#include <array>
#include <atomic>
#include <chrono>
#include <gtest/gtest.h>
#include <thread>
#include <vector>

namespace bb {

class TaggedAtomicThreadPoolTests : public ::testing::TestWithParam<size_t> {};

TEST_P(TaggedAtomicThreadPoolTests, RepeatedJobsExecuteExactlyOnceAndPublishResults)
{
    detail::TaggedAtomicThreadPool pool(GetParam());
    for (size_t job = 0; job < 512; ++job) {
        const size_t n = std::array<size_t, 8>{ 0, 1, 129, 2, 63, 7, 256, 3 }[job % 8];
        std::vector<std::atomic<size_t>> counts(n);
        std::vector<size_t> results(n, 0);
        std::atomic<bool> out_of_range = false;
        pool.run(n, [&](size_t i) {
            if (i >= n) {
                out_of_range.store(true);
                return;
            }
            counts[i].fetch_add(1, std::memory_order_relaxed);
            if ((i + job) % 17 == 0) {
                std::this_thread::yield();
            }
            results[i] = (job + 1) * (i + 3);
        });
        ASSERT_FALSE(out_of_range.load());
        for (size_t i = 0; i < n; ++i) {
            ASSERT_EQ(counts[i].load(), 1U) << "job " << job << ", index " << i;
            ASSERT_EQ(results[i], (job + 1) * (i + 3));
        }
    }
}

TEST_P(TaggedAtomicThreadPoolTests, SleepWakeAndShutdown)
{
    for (size_t lifetime = 0; lifetime < 8; ++lifetime) {
        detail::TaggedAtomicThreadPool pool(GetParam());
        for (size_t job = 0; job < 4; ++job) {
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
            std::array<size_t, 16> results{};
            pool.run(results.size(), [&](size_t i) {
                std::this_thread::sleep_for(std::chrono::milliseconds(1));
                results.at(i) = i + 1;
            });
            for (size_t i = 0; i < results.size(); ++i) {
                ASSERT_EQ(results[i], i + 1);
            }
        }
        std::this_thread::sleep_for(std::chrono::milliseconds(2));
    }
}

TEST(TaggedAtomicThreadPoolLifecycleTests, ImmediateShutdown)
{
    for (size_t i = 0; i < 64; ++i) {
        detail::TaggedAtomicThreadPool pool(2);
    }
}

TEST(TaggedAtomicThreadPoolLifecycleTests, IndependentOwners)
{
    std::array<std::array<size_t, 32>, 4> results{};
    std::vector<std::thread> owners;
    for (size_t owner = 0; owner < results.size(); ++owner) {
        owners.emplace_back([&, owner] {
            detail::TaggedAtomicThreadPool pool(2);
            for (size_t job = 0; job < 64; ++job) {
                pool.run(results[owner].size(), [&](size_t i) { results[owner].at(i) += owner + 1; });
            }
        });
    }
    for (auto& owner : owners) {
        owner.join();
    }
    for (size_t owner = 0; owner < results.size(); ++owner) {
        for (auto result : results[owner]) {
            EXPECT_EQ(result, 64 * (owner + 1));
        }
    }
}

TEST(TaggedAtomicThreadPoolLifecycleTests, NestedCalls)
{
    std::array<std::array<size_t, 8>, 4> results{};
    parallel_for_tagged_atomic_pool(results.size(), [&](size_t outer) {
        parallel_for_tagged_atomic_pool(results[outer].size(),
                                        [&](size_t inner) { results[outer].at(inner) = outer * 8 + inner + 1; });
    });
    for (size_t outer = 0; outer < results.size(); ++outer) {
        for (size_t inner = 0; inner < results[outer].size(); ++inner) {
            EXPECT_EQ(results[outer][inner], outer * 8 + inner + 1);
        }
    }
}

INSTANTIATE_TEST_SUITE_P(WorkerCounts, TaggedAtomicThreadPoolTests, ::testing::Values(0U, 1U, 3U));

} // namespace bb
#endif
