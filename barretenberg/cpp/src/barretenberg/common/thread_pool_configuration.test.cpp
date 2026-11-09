#include "thread.hpp"

#include <atomic>
#include <cstdlib>
#include <gtest/gtest.h>
#include <thread>
#include <vector>

namespace bb {

#if !defined(NO_MULTITHREADING) && !defined(OMP_MULTITHREADING) && !defined(__wasm__)
namespace {

[[noreturn]] void check_configuration(bool enabled)
{
    if (experimental_thread_pool_enabled() || !configure_experimental_thread_pool(!enabled) ||
        !configure_experimental_thread_pool(enabled) || experimental_thread_pool_enabled() != enabled) {
        std::_Exit(1);
    }
    std::atomic<bool> error = false;
    std::vector<std::atomic<size_t>> counts(64);
    std::vector<size_t> results(64, 0);
    std::vector<std::thread> owners;
    for (size_t owner = 0; owner < 2; ++owner) {
        owners.emplace_back([&, owner] {
            set_parallel_for_concurrency(2);
            parallel_for(8, [&](size_t outer) {
                if (experimental_thread_pool_enabled() != enabled || configure_experimental_thread_pool(!enabled)) {
                    error.store(true);
                }
                parallel_for(4, [&](size_t inner) {
                    const size_t i = owner * 32 + outer * 4 + inner;
                    counts[i].fetch_add(1, std::memory_order_relaxed);
                    results[i] = i + 1;
                });
            });
        });
    }
    for (auto& owner : owners) {
        owner.join();
    }
    if (error.load() || configure_experimental_thread_pool(!enabled) || !configure_experimental_thread_pool(enabled) ||
        experimental_thread_pool_enabled() != enabled) {
        std::_Exit(1);
    }
    for (size_t i = 0; i < results.size(); ++i) {
        if (counts[i].load() != 1 || results[i] != i + 1) {
            std::_Exit(1);
        }
    }
    std::_Exit(0);
}

} // namespace

TEST(ThreadPoolConfigurationDeathTest, BaselineSelectionIsFixedAndShared)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    ASSERT_EXIT(check_configuration(false), ::testing::ExitedWithCode(0), "");
}

TEST(ThreadPoolConfigurationDeathTest, ExperimentalSelectionIsFixedAndShared)
{
    GTEST_FLAG_SET(death_test_style, "threadsafe");
    ASSERT_EXIT(check_configuration(true), ::testing::ExitedWithCode(0), "");
}
#else
TEST(ThreadPoolConfigurationTest, UnsupportedBuildRejectsExperimentalSelection)
{
    EXPECT_FALSE(configure_experimental_thread_pool(true));
    EXPECT_TRUE(configure_experimental_thread_pool(false));
    EXPECT_FALSE(experimental_thread_pool_enabled());
}
#endif

} // namespace bb
