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
#ifndef __wasm__
#include <pthread.h>
#endif
#include <queue>
#include <thread>
#include <vector>

#include "barretenberg/common/compiler_hints.hpp"

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
            // BB_BENCH_NAME("do_iterations()");
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

void ThreadPool::worker_loop(size_t /*unused*/)
{
    // info("created worker ", worker_num);
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
struct PerThreadPoolData {
    ThreadPool pool;
    bool nested = false;
    PerThreadPoolData(size_t num_threads)
        : pool(num_threads)
    {}
};

#ifndef __wasm__
// Use POSIX pthread keys for per-thread pool storage instead of C++ thread_local.
// Zig's Mach-O linker corrupts C++ thread_local offsets when a Rust static library
// with __thread_vars sections is linked into the same binary, causing segfaults on
// x86_64-macos. pthread_key uses a different TLS mechanism (runtime hashtable)
// unaffected by this linker bug.
pthread_key_t pool_key;
pthread_once_t pool_key_once = PTHREAD_ONCE_INIT;

void destroy_pool_data(void* ptr)
{
    delete static_cast<PerThreadPoolData*>(ptr);
}

void init_pool_key()
{
    pthread_key_create(&pool_key, destroy_pool_data);
}

PerThreadPoolData& get_pool_data()
{
    pthread_once(&pool_key_once, init_pool_key);
    auto* data = static_cast<PerThreadPoolData*>(pthread_getspecific(pool_key));
    if (data == nullptr) {
        data = new PerThreadPoolData(bb::get_num_cpus() - 1);
        pthread_setspecific(pool_key, data);
    }
    return *data;
}
#endif

} // namespace

namespace bb {
/**
 * A thread pooled strategy that uses std::mutex for protection. Each worker increments the "iteration" and processes.
 * The main thread acts as a worker also, and when it completes, it spins until thread workers are done.
 */
void parallel_for_mutex_pool(size_t num_iterations, const std::function<void(size_t)>& func)
{
#ifdef __wasm__
    static ThreadPool pool(get_num_cpus() - 1);
    static bool nested = false;
    auto& pool_ref = pool;
    auto& nested_ref = nested;
#else
    auto& data = get_pool_data();
    auto& pool_ref = data.pool;
    auto& nested_ref = data.nested;
#endif

    // If nested, fall back to serial execution
    if (nested_ref) {
        for (size_t i = 0; i < num_iterations; ++i) {
            func(i);
        }
        return;
    }

    nested_ref = true;
    pool_ref.start_tasks(num_iterations, func);
    nested_ref = false;
}
} // namespace bb
#endif
