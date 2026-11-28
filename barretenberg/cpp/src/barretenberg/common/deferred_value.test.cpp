#include "barretenberg/common/deferred_value.hpp"
#include "barretenberg/common/thread.hpp"

#include <atomic>
#include <cstddef>
#include <gtest/gtest.h>
#include <stdexcept>
#include <vector>

#ifdef BB_DEFERRED_VALUE_THREADED
#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <thread>
#endif

using namespace bb;

namespace {

#ifndef NO_MULTITHREADING
class ConcurrencyGuard {
  public:
    ConcurrencyGuard() = default;
    ConcurrencyGuard(const ConcurrencyGuard&) = delete;
    ConcurrencyGuard(ConcurrencyGuard&&) = delete;
    ConcurrencyGuard& operator=(const ConcurrencyGuard&) = delete;
    ConcurrencyGuard& operator=(ConcurrencyGuard&&) = delete;
    ~ConcurrencyGuard() { set_parallel_for_concurrency(saved_); }

  private:
    size_t saved_ = get_num_cpus();
};
#endif

#ifdef __cpp_exceptions
struct TaskError : std::runtime_error {
    using std::runtime_error::runtime_error;
};

constexpr const char* TASK_ERROR_MESSAGE = "background task failed";

int throw_task_error()
{
    throw TaskError(TASK_ERROR_MESSAGE);
}
#endif

#ifdef BB_DEFERRED_VALUE_THREADED
// A single-use countdown: wait() blocks, without a deadline, until count_down() has been called `count` times.
class Countdown {
  public:
    explicit Countdown(size_t count)
        : remaining_(count)
    {}

    void count_down()
    {
        {
            const std::lock_guard<std::mutex> lock(mutex_);
            --remaining_;
        }
        condition_.notify_all();
    }

    void wait()
    {
        std::unique_lock<std::mutex> lock(mutex_);
        condition_.wait(lock, [this] { return remaining_ == 0; });
    }

  private:
    std::mutex mutex_;
    std::condition_variable condition_;
    size_t remaining_;
};

// Counts `countdown` down when destroyed. Declared after a handle it is destroyed first, so a waiter learns that the
// scope's destruction has begun while the handle is still alive.
class CountDownOnDestruction {
  public:
    explicit CountDownOnDestruction(Countdown& countdown)
        : countdown_(countdown)
    {}
    CountDownOnDestruction(const CountDownOnDestruction&) = delete;
    CountDownOnDestruction(CountDownOnDestruction&&) = delete;
    CountDownOnDestruction& operator=(const CountDownOnDestruction&) = delete;
    CountDownOnDestruction& operator=(CountDownOnDestruction&&) = delete;
    ~CountDownOnDestruction() { countdown_.count_down(); }

  private:
    Countdown& countdown_;
};

#ifdef __cpp_exceptions
void expect_task_error(const DeferredValue<int>& handle)
{
    try {
        (void)handle.get();
        ADD_FAILURE() << "get() did not throw";
    } catch (const TaskError& error) {
        EXPECT_STREQ(error.what(), TASK_ERROR_MESSAGE);
    } catch (...) {
        ADD_FAILURE() << "get() threw an exception of another type";
    }
}
#endif
#endif

} // namespace

TEST(DeferredValue, GetReturnsTheCallablesValue)
{
    const DeferredValue<int> empty;
    EXPECT_FALSE(empty.valid());

    const auto handle = DeferredValue<int>::launch([] { return 42; });
    EXPECT_TRUE(handle.valid());
    const int& first = handle.get();
    const int& second = handle.get();
    EXPECT_EQ(first, 42);
    EXPECT_EQ(&first, &second);
    EXPECT_TRUE(handle.valid());
}

TEST(DeferredValue, CopiesShareOneResult)
{
    const auto handle = DeferredValue<std::vector<int>>::launch([] { return std::vector<int>{ 1, 2, 3 }; });
    const DeferredValue<std::vector<int>> copy = handle;
    EXPECT_EQ(copy.get(), (std::vector<int>{ 1, 2, 3 }));
    EXPECT_EQ(&copy.get(), &handle.get());
}

TEST(DeferredValue, ResolveIntoFillsAnEmptyTarget)
{
    std::vector<int> target;
    auto pending = DeferredValue<std::vector<int>>::launch([] { return std::vector<int>{ 1, 2, 3 }; });
    const std::vector<int>& resolved = resolve_into(target, pending);
    EXPECT_EQ(&resolved, &target);
    EXPECT_EQ(target, (std::vector<int>{ 1, 2, 3 }));
    EXPECT_FALSE(pending.valid());
}

TEST(DeferredValue, ResolveIntoKeepsANonEmptyTarget)
{
    std::vector<int> target{ 9 };
    auto pending = DeferredValue<std::vector<int>>::launch([] { return std::vector<int>{ 1, 2, 3 }; });
    resolve_into(target, pending);
    EXPECT_EQ(target, (std::vector<int>{ 9 }));
    EXPECT_FALSE(pending.valid());
}

TEST(DeferredValue, ResolveIntoWithoutAPendingValueReturnsTheTarget)
{
    std::vector<int> target{ 4 };
    DeferredValue<std::vector<int>> pending;
    EXPECT_EQ(&resolve_into(target, pending), &target);
    EXPECT_EQ(target, (std::vector<int>{ 4 }));
}

// Holds whether the callable runs on a thread of its own or inline in launch().
TEST(DeferredValue, CallableNeverSeesMoreThreadsThanTheLauncher)
{
    const size_t launcher_threads = get_num_cpus();
    const auto handle = DeferredValue<size_t>::launch([] { return get_num_cpus(); });
    EXPECT_GE(handle.get(), 1U);
    EXPECT_LE(handle.get(), launcher_threads);
}

#ifndef NO_MULTITHREADING
TEST(DeferredValue, CallableRunsAtTheLaunchersThreadCount)
{
    const ConcurrencyGuard guard;
    set_parallel_for_concurrency(3);
    const size_t expected = background_task_concurrency();
    ASSERT_EQ(expected, 3U);
    const auto handle = DeferredValue<size_t>::launch([] { return get_num_cpus(); });
    EXPECT_EQ(handle.get(), expected);
}
#endif

#ifdef BB_DEFERRED_VALUE_THREADED
TEST(DeferredValue, CallableThreadCountIsCapped)
{
    const ConcurrencyGuard guard;
    set_parallel_for_concurrency(MAX_BACKGROUND_TASK_THREADS + 4);
    const auto handle = DeferredValue<size_t>::launch([] { return get_num_cpus(); });
    EXPECT_EQ(handle.get(), MAX_BACKGROUND_TASK_THREADS);
}

TEST(DeferredValue, LastHandleDestructionJoinsTheThread)
{
    Countdown release(1);
    Countdown scope_destruction_begun(1);
    std::atomic<bool> finished{ false };
    // The release waits for the scope's destruction to begin, so the task is unfinished when it does. That the handle's
    // destructor is already inside join() when the release comes is only likely; the delay makes it so, and never
    // decides the outcome for a joining destructor.
    std::thread releaser([&release, &scope_destruction_begun] {
        scope_destruction_begun.wait();
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
        release.count_down();
    });
    {
        const auto handle = DeferredValue<int>::launch([&release, &finished] {
            release.wait();
            finished.store(true);
            return 1;
        });
        const CountDownOnDestruction signal(scope_destruction_begun);
    }
    EXPECT_TRUE(finished.load());
    releaser.join();
}

TEST(DeferredValue, DestroyingACopyNeitherWaitsNorLosesTheResult)
{
    Countdown release(1);
    std::atomic<bool> finished{ false };
    const auto survivor = DeferredValue<int>::launch([&release, &finished] {
        release.wait();
        finished.store(true);
        return 42;
    });
    // A copy whose destructor waits for the callable never returns from this scope, which the runner's timeout catches.
    {
        const DeferredValue<int> copy = survivor;
        EXPECT_TRUE(copy.valid());
    }
    EXPECT_FALSE(finished.load());
    release.count_down();
    EXPECT_EQ(survivor.get(), 42);
}

TEST(DeferredValue, GetFromTwoThreadsOnTwoCopiesReturnsTheSameValue)
{
    Countdown release(1);
    Countdown getters_ready(2);
    const auto first = DeferredValue<int>::launch([&release] {
        release.wait();
        return 7;
    });
    const DeferredValue<int> second = first;

    int from_first = 0;
    int from_second = 0;
    std::thread first_getter([&] {
        getters_ready.count_down();
        from_first = first.get();
    });
    std::thread second_getter([&] {
        getters_ready.count_down();
        from_second = second.get();
    });
    // Both getter threads have started before the release. That their joins overlap is only likely; the delay makes it
    // so, and never decides the outcome.
    getters_ready.wait();
    std::this_thread::sleep_for(std::chrono::milliseconds(10));
    release.count_down();
    first_getter.join();
    second_getter.join();

    EXPECT_EQ(from_first, 7);
    EXPECT_EQ(from_second, 7);
    EXPECT_EQ(&first.get(), &second.get());
}

#ifdef __cpp_exceptions
TEST(DeferredValue, GetRethrowsOnEveryCallAndFromEveryCopy)
{
    const auto handle = DeferredValue<int>::launch([] { return throw_task_error(); });
    const DeferredValue<int> copy = handle;
    expect_task_error(handle);
    expect_task_error(handle);
    expect_task_error(copy);
    expect_task_error(copy);
}

TEST(DeferredValue, DestroyingAFailedHandleWithoutGetDoesNotTerminate)
{
    std::atomic<bool> started{ false };
    {
        const auto handle = DeferredValue<int>::launch([&started] {
            started.store(true);
            return throw_task_error();
        });
    }
    EXPECT_TRUE(started.load());
}

TEST(DeferredValue, CallerUnwindingJoinsARunningTaskAndKeepsTheCallersException)
{
    struct CallerError : std::runtime_error {
        using std::runtime_error::runtime_error;
    };
    constexpr const char* CALLER_ERROR_MESSAGE = "caller failed while its task ran";
    constexpr int TRACKED_VALUE = 5;

    struct Tracked {
        explicit Tracked(std::atomic<bool>& destroyed_flag)
            : destroyed(destroyed_flag)
        {}
        ~Tracked() { destroyed.store(true); }
        std::atomic<bool>& destroyed;
        int value = TRACKED_VALUE;
    };

    Countdown release(1);
    Countdown unwinding_begun(1);
    std::atomic<bool> tracked_destroyed{ false };
    std::atomic<bool> destroyed_when_read{ true };
    std::atomic<int> value_read{ 0 };
    std::atomic<bool> finished{ false };
    auto tracked = std::make_shared<Tracked>(tracked_destroyed);

    // The task reads what it captured only after the unwinding has begun. That the handle's destructor is already
    // inside join() when the release comes is only likely; the delay makes it so, and never decides the outcome.
    std::thread releaser([&release, &unwinding_begun] {
        unwinding_begun.wait();
        std::this_thread::sleep_for(std::chrono::milliseconds(20));
        release.count_down();
    });
    bool caught = false;
    try {
        const auto handle = DeferredValue<int>::launch(
            [&release, &tracked_destroyed, &destroyed_when_read, &value_read, &finished, tracked = std::move(tracked)] {
                release.wait();
                destroyed_when_read.store(tracked_destroyed.load());
                value_read.store(tracked->value);
                finished.store(true);
                return tracked->value;
            });
        const CountDownOnDestruction signal(unwinding_begun);
        throw CallerError(CALLER_ERROR_MESSAGE);
    } catch (const CallerError& error) {
        caught = true;
        EXPECT_STREQ(error.what(), CALLER_ERROR_MESSAGE);
        EXPECT_TRUE(finished.load());
    } catch (...) {
        ADD_FAILURE() << "the caller's exception was replaced by one of another type";
    }
    releaser.join();
    EXPECT_TRUE(caught);
    EXPECT_FALSE(destroyed_when_read.load());
    EXPECT_EQ(value_read.load(), TRACKED_VALUE);
}

TEST(DeferredValue, ResolveIntoPropagatesTheException)
{
    std::vector<int> target;
    auto pending =
        DeferredValue<std::vector<int>>::launch([]() -> std::vector<int> { throw TaskError(TASK_ERROR_MESSAGE); });
    EXPECT_THROW(resolve_into(target, pending), TaskError);
    EXPECT_TRUE(target.empty());
}
#endif
#elif defined(__cpp_exceptions)
// Without native threads the callable runs inside launch(), so its exception leaves launch() itself.
TEST(DeferredValue, InlineLaunchPropagatesTheException)
{
    EXPECT_THROW((void)DeferredValue<int>::launch([] { return throw_task_error(); }), TaskError);
}
#endif
