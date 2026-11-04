#include "barretenberg/common/interrupt.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"

#include <gtest/gtest.h>

#include <atomic>
#include <chrono>
#include <mutex>
#include <set>
#include <stdexcept>
#include <string>
#include <thread>
#include <vector>

using namespace bb;

namespace {

std::vector<std::string> observed_sites;

void record_site(const char* site)
{
    observed_sites.emplace_back(site);
}

// The flag and the observer are process-wide; every test leaves both cleared.
class InterruptTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        InterruptFlag::clear();
        observed_sites.clear();
    }
    void TearDown() override
    {
        InterruptFlag::clear();
        detail::set_interrupt_observer(nullptr);
    }
};

} // namespace

TEST_F(InterruptTest, UnarmedPointNeverThrows)
{
    InterruptFlag::request();
    EXPECT_NO_THROW(interrupt_point("test:unarmed"));
}

TEST_F(InterruptTest, ArmedPointThrowsOnlyWhenRequested)
{
    InterruptScope scope;
    EXPECT_NO_THROW(interrupt_point("test:armed"));
    InterruptFlag::request();
    try {
        interrupt_point("test:armed");
        FAIL() << "an armed point with the flag set must throw";
    } catch (const InterruptedException& exception) {
        EXPECT_STREQ(exception.what(), INTERRUPTED_MESSAGE);
    }
}

TEST_F(InterruptTest, ClearReportsWhetherTheFlagWasSet)
{
    EXPECT_FALSE(InterruptFlag::clear());
    InterruptFlag::request();
    InterruptFlag::request();
    EXPECT_TRUE(InterruptFlag::clear());
    EXPECT_FALSE(InterruptFlag::clear());
}

TEST_F(InterruptTest, ScopeEndDisarms)
{
    {
        InterruptScope outer;
        InterruptScope inner;
    }
    InterruptFlag::request();
    EXPECT_NO_THROW(interrupt_point("test:disarmed"));
}

// The calling thread runs iterations of its own parallel_for region, so an armed point reached from a task must not
// throw: unwinding out of a task would leave the pool waiting for it.
TEST_F(InterruptTest, PointInsideParallelRegionNeverThrows)
{
    InterruptScope scope;
    InterruptFlag::request();
    constexpr size_t NUM_ITERATIONS = 64;
    std::atomic<size_t> completed{ 0 };
    EXPECT_NO_THROW(parallel_for(NUM_ITERATIONS, [&](size_t) {
        interrupt_point("test:parallel");
        completed.fetch_add(1);
    }));
    EXPECT_EQ(completed.load(), NUM_ITERATIONS);

    // The pool still runs a region on several threads afterwards.
    InterruptFlag::clear();
    std::mutex mutex;
    std::set<std::thread::id> thread_ids;
    parallel_for(NUM_ITERATIONS, [&](size_t) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
        const std::lock_guard lock(mutex);
        thread_ids.insert(std::this_thread::get_id());
    });
    if (get_num_cpus() > 1) {
        EXPECT_GT(thread_ids.size(), 1U);
    }
    // Leaving the region restored the ParallelRegion depth, so an armed point on the caller throws again.
    InterruptFlag::request();
    EXPECT_THROW(interrupt_point("test:after_parallel"), InterruptedException);
}

TEST_F(InterruptTest, PointReachedWhileUnwindingNeverThrows)
{
    struct ReachesPointOnDestruction {
        ~ReachesPointOnDestruction() { interrupt_point("test:destructor"); }
    };
    InterruptScope scope;
    InterruptFlag::request();
    EXPECT_THROW(
        {
            ReachesPointOnDestruction guard;
            throw std::runtime_error("unrelated failure");
        },
        std::runtime_error);
}

TEST_F(InterruptTest, ObserverSeesArmedPointsOnly)
{
    detail::set_interrupt_observer(record_site);
    interrupt_point("test:unarmed");
    {
        InterruptScope scope;
        interrupt_point("test:armed");
    }
    EXPECT_EQ(observed_sites, std::vector<std::string>{ "test:armed" });
}

// Measurement only: the per-check cost that bounds the overhead on an uninterrupted proof.
TEST_F(InterruptTest, DISABLED_CostPerCheck)
{
    constexpr size_t NUM_CHECKS = 100'000'000;
    InterruptScope scope;
    const auto checks_start = std::chrono::steady_clock::now();
    for (size_t i = 0; i < NUM_CHECKS; ++i) {
        interrupt_point("test:cost");
    }
    const auto checks_end = std::chrono::steady_clock::now();
    for (size_t i = 0; i < NUM_CHECKS; ++i) {
        detail::ParallelRegion region;
    }
    const auto regions_end = std::chrono::steady_clock::now();
    const auto nanoseconds_per = [](auto start, auto end) {
        return static_cast<double>(std::chrono::duration_cast<std::chrono::nanoseconds>(end - start).count()) /
               static_cast<double>(NUM_CHECKS);
    };
    info("ns per armed check: ", nanoseconds_per(checks_start, checks_end));
    info("ns per parallel region marker: ", nanoseconds_per(checks_end, regions_end));
}
