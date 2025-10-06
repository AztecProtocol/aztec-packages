#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#ifndef NO_MULTITHREADING
#include "log.hpp"
#include "thread.hpp"
#include <atomic>
#include <condition_variable>
#include <functional>
#include <memory>
#include <mutex>
#include <queue>
#include <thread>
#include <vector>

#include "barretenberg/common/compiler_hints.hpp"

namespace {

class ThreadPool {
  public:
    ThreadPool(size_t num_threads = 0);
    ThreadPool(const ThreadPool& other) = delete;
    ThreadPool(ThreadPool&& other) = delete;
    ~ThreadPool();

    ThreadPool& operator=(const ThreadPool& other) = delete;
    ThreadPool& operator=(ThreadPool&& other) = delete;

    void start_tasks(size_t num_iterations, const std::function<void(size_t)>& func, size_t inner_concurrency)
    {
        parent.store(bb::detail::GlobalBenchStatsContainer::parent);
        {
            std::unique_lock<std::mutex> lock(tasks_mutex);
            task_ = func;
            num_iterations_ = num_iterations;
            iteration_ = 0;
            complete_ = 0;
            inner_concurrency_ = inner_concurrency;
        }
        condition.notify_all();

        do_iterations();

        {
            // BB_BENCH_NAME("spinning main thread");
            std::unique_lock<std::mutex> lock(tasks_mutex);
            complete_condition_.wait(lock, [this] { return complete_ == num_iterations_; });
        }
    }

    void grow(size_t target_num_threads)
    {
        std::unique_lock<std::mutex> lock(tasks_mutex);
        size_t current_workers = workers.size();
        if (target_num_threads <= current_workers) {
            return;
        }
        workers.reserve(target_num_threads);
        for (size_t i = current_workers; i < target_num_threads; ++i) {
            workers.emplace_back(&ThreadPool::worker_loop, this, i);
        }
    }

    size_t get_num_workers() const { return workers.size(); }

  private:
    std::atomic<bb::detail::TimeStatsEntry*> parent = nullptr;
    std::vector<std::thread> workers;
    std::mutex tasks_mutex;
    std::function<void(size_t)> task_;
    size_t inner_concurrency_ = 1;
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
            // NOTE: This sets the concurrency for this thread. That is, the amount of threads
            // that are used when this calls parallel_for_mutex_pool() (including itself).
            // The current design for nested parallel_for calls still closely follows the original design where it was
            // not possible, so this has a somewhat awkward name.
            bb::set_parallel_for_concurrency(inner_concurrency_);
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
    static thread_local size_t nesting_level = 0;
    // There is a unique pool for each thread * nesting level.
    // The main thread will have nesting_level one greater than its child threads.
    // This needs to be an array so that when the main thread recurses here, it uses a different thread pool.
    static thread_local std::array<ThreadPool, PARALLEL_FOR_MAX_NESTING> pools;

    // If we exceed max nesting, throw an error
    if (nesting_level >= PARALLEL_FOR_MAX_NESTING) {
        throw_or_abort("parallel_for_mutex_pool: exceeded maximum nesting level");
    }

    ThreadPool& pool = pools[nesting_level];

    // Initialize the pool if needed, or grow it if hardware concurrency has increased.
    // The ThreadPool is default-constructed with 0 workers, so grow() will initialize it on first use.
    // Growing past the first initialization, however, is a niche scenario that mostly comes up in testing
    // where we may have multiple set_parallel_for_concurrency values (a pool that is bigger is not an issue
    // as set_parallel_for_concurrency affects get_num_cpus(), which will naturally limit concurrency).
    if (get_num_cpus() > pool.get_num_workers() + 1) {
        pool.grow(get_num_cpus() - 1);
    }

    // We compute inner concurrency here.
    // This controls behavior if parallel_for_mutex_pool is called from within a task that is itself running in
    // parallel_for_mutex_pool. For the cases where we do want inner concurrency, (e.g. processing contracts in
    // aztec_process.cpp) having at least some inner concurrency smoothes out the task having uneven times, allowing
    // more threads to share the work.
    size_t total_threads = pool.get_num_workers() + 1;
    size_t inner_concurrency =
        std::max(size_t{ 2 }, (total_threads + num_iterations - 1) / std::max(num_iterations, size_t{ 1 }));

    nesting_level++;
    pool.start_tasks(num_iterations, func, inner_concurrency);
    nesting_level--;
}
} // namespace bb
#endif
