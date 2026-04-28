#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#ifndef NO_MULTITHREADING
#include "log.hpp"
#include "thread.hpp"
#include <atomic>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

#include "barretenberg/common/compiler_hints.hpp"

// Fix for https://github.com/AztecProtocol/aztec-packages/issues/19769
// Zig's Mach-O linker (https://codeberg.org/ziglang/zig/issues/31461) misaligns
// __thread_bss TLS template offsets when __thread_data is also present (from Rust
// static libraries), causing x86_64-macos segfaults on any thread_local requiring
// 16-byte alignment (e.g. std::mutex). Adding an alignas(16) initialized
// thread_local forces __thread_data alignment to 16, ensuring __thread_bss starts
// at a correctly aligned TLS template offset.
// NOLINTBEGIN
alignas(16) thread_local char tls_alignment_pad[16] __attribute__((used)) = { 1 };
// NOLINTEND

namespace {

class ThreadPool {
  public:
    ThreadPool(size_t num_threads);
    ThreadPool(const ThreadPool& other) = delete;
    ThreadPool(ThreadPool&& other) = delete;
    ~ThreadPool();

    ThreadPool& operator=(const ThreadPool& other) = delete;
    ThreadPool& operator=(ThreadPool&& other) = delete;

    void start_tasks(size_t num_iterations, const std::function<void(size_t)>& func)
    {
        parent.store(bb::detail::GlobalBenchStatsContainer::parent);
        {
            std::unique_lock<std::mutex> lock(tasks_mutex);
            task_ = func;
            num_iterations_ = num_iterations;
            iteration_ = 0;
            complete_ = 0;
        }
        condition.notify_all();

        do_iterations();

        {
            // BB_BENCH_NAME("spinning main thread");
            std::unique_lock<std::mutex> lock(tasks_mutex);
            complete_condition_.wait(lock, [this] { return complete_ == num_iterations_; });
        }
    }

  private:
    std::atomic<bb::detail::TimeStatsEntry*> parent = nullptr;
    std::vector<std::thread> workers;
    std::mutex tasks_mutex;
    std::function<void(size_t)> task_;
    size_t num_iterations_ = 0;
    size_t iteration_ = 0;
    size_t complete_ = 0;
    std::condition_variable condition;
    std::condition_variable complete_condition_;
    bool stop = false;

    BB_NO_PROFILE void worker_loop(size_t thread_index);

    void do_iterations()
    {
        while (true) {
            size_t iteration = 0;
            {
                std::unique_lock<std::mutex> lock(tasks_mutex);
                if (iteration_ == num_iterations_) {
                    return;
                }
                iteration = iteration_++;
            }
            task_(iteration);
            {
                std::unique_lock<std::mutex> lock(tasks_mutex);
                if (++complete_ == num_iterations_) {
                    complete_condition_.notify_one();
                    return;
                }
            }
        }
    }
};

ThreadPool::ThreadPool(size_t num_threads)
{
    workers.reserve(num_threads);
    for (size_t i = 0; i < num_threads; ++i) {
        workers.emplace_back(&ThreadPool::worker_loop, this, i);
    }
}

ThreadPool::~ThreadPool()
{
    {
        std::unique_lock<std::mutex> lock(tasks_mutex);
        stop = true;
    }
    condition.notify_all();
    for (auto& worker : workers) {
        worker.join();
    }
}

void ThreadPool::worker_loop([[maybe_unused]] size_t thread_index)
{
    // info("created worker ", thread_index);
    while (true) {
        {
            std::unique_lock<std::mutex> lock(tasks_mutex);
            condition.wait(lock, [this] { return (iteration_ < num_iterations_) || stop; });

            if (stop) {
                break;
            }
        }
        // Make sure nested stats accounting works under multithreading
        // Note: parent is a thread-local variable.
        bb::detail::GlobalBenchStatsContainer::parent = parent.load();
        do_iterations();
    }
    // info("worker exit ", worker_num);
}
} // namespace

namespace bb {
/**
 * A thread pooled strategy that uses std::mutex for protection. Each worker increments the "iteration" and processes.
 * The main thread acts as a worker also, and when it completes, it spins until thread workers are done.
 */
void parallel_for_mutex_pool(size_t num_iterations, const std::function<void(size_t)>& func)
{
#ifdef __wasm__
#define THREAD_LOCAL_MAYBE
#else
#define THREAD_LOCAL_MAYBE thread_local
#endif

    static THREAD_LOCAL_MAYBE ThreadPool pool(get_num_cpus() - 1);
    static THREAD_LOCAL_MAYBE bool nested = false;

    // If nested, fall back to serial execution
    if (nested) {
        for (size_t i = 0; i < num_iterations; ++i) {
            func(i);
        }
        return;
    }

    nested = true;
    pool.start_tasks(num_iterations, func);
    nested = false;
}
} // namespace bb
#endif
