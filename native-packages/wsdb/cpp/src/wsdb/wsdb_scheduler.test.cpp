/**
 * @file wsdb_scheduler.test.cpp
 * @brief The per-fork ordering holds when requests are submitted from several threads at once.
 */
#include "wsdb/wsdb_scheduler.hpp"
#include "common/thread_pool.hpp"

#include <gtest/gtest.h>

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

using namespace azteclabs::wsdb;

namespace {

/** Counts the ops running on one fork, and records any moment the ordering is broken. */
struct ForkProbe {
    std::atomic<int> readers{ 0 };
    std::atomic<int> writers{ 0 };
    std::atomic<int> violations{ 0 };

    void read()
    {
        readers.fetch_add(1);
        if (writers.load() != 0) {
            violations.fetch_add(1);
        }
        std::this_thread::sleep_for(std::chrono::microseconds(50));
        readers.fetch_sub(1);
    }

    void write()
    {
        if (writers.fetch_add(1) != 0 || readers.load() != 0) {
            violations.fetch_add(1);
        }
        std::this_thread::sleep_for(std::chrono::microseconds(50));
        writers.fetch_sub(1);
    }
};

/** Waits until `expected` ops have completed. */
class Completions {
  public:
    explicit Completions(int expected)
        : remaining_(expected)
    {}
    void done()
    {
        std::lock_guard<std::mutex> lock(mutex_);
        if (--remaining_ == 0) {
            all_done_.notify_all();
        }
    }
    bool wait()
    {
        std::unique_lock<std::mutex> lock(mutex_);
        return all_done_.wait_for(lock, std::chrono::seconds(60), [this] { return remaining_ == 0; });
    }

  private:
    std::mutex mutex_;
    std::condition_variable all_done_;
    int remaining_;
};

} // namespace

TEST(WsdbScheduler, OrdersReadsAndWritesSubmittedFromManyThreads)
{
    constexpr int threads = 8;
    constexpr int ops_per_thread = 200;
    constexpr uint64_t fork = 7;
    ThreadPool pool(4);
    auto scheduler = std::make_shared<WsdbScheduler>(pool, [] { return false; });
    ForkProbe probe;
    Completions completions(threads * ops_per_thread);

    std::vector<std::thread> submitters;
    for (int t = 0; t < threads; t++) {
        submitters.emplace_back([&, t] {
            for (int i = 0; i < ops_per_thread; i++) {
                if ((i + t) % 4 == 0) {
                    scheduler->submit_write(fork, [&] {
                        probe.write();
                        completions.done();
                    });
                } else {
                    scheduler->submit_read(fork, /*committed=*/false, [&] {
                        probe.read();
                        completions.done();
                    });
                }
            }
        });
    }
    for (auto& submitter : submitters) {
        submitter.join();
    }
    ASSERT_TRUE(completions.wait());
    EXPECT_EQ(probe.violations.load(), 0) << "a read overlapped a write, or two writes overlapped, on one fork";
}

TEST(WsdbScheduler, WriteFromAnotherThreadWaitsForAReadRunningOnItsSubmitter)
{
    constexpr uint64_t fork = 3;
    ThreadPool pool(2);
    auto scheduler = std::make_shared<WsdbScheduler>(pool, [] { return false; });

    std::mutex mutex;
    std::condition_variable changed;
    bool read_running = false;
    bool release_read = false;
    bool read_done = false;
    bool write_ran_during_read = false;
    bool write_done = false;

    // Nothing is in flight, so this read runs on its submitter, which it holds until released.
    std::thread reader([&] {
        scheduler->submit_read(fork, /*committed=*/false, [&] {
            std::unique_lock<std::mutex> lock(mutex);
            read_running = true;
            changed.notify_all();
            changed.wait(lock, [&] { return release_read; });
            read_done = true;
        });
    });
    {
        std::unique_lock<std::mutex> lock(mutex);
        ASSERT_TRUE(changed.wait_for(lock, std::chrono::seconds(10), [&] { return read_running; }));
    }

    scheduler->submit_write(fork, [&] {
        std::lock_guard<std::mutex> lock(mutex);
        write_ran_during_read = !read_done;
        write_done = true;
        changed.notify_all();
    });
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    {
        std::lock_guard<std::mutex> lock(mutex);
        release_read = true;
        changed.notify_all();
    }
    reader.join();
    {
        std::unique_lock<std::mutex> lock(mutex);
        ASSERT_TRUE(changed.wait_for(lock, std::chrono::seconds(10), [&] { return write_done; }));
    }
    EXPECT_FALSE(write_ran_during_read) << "the write on the fork ran while a read on it was still running";
}
