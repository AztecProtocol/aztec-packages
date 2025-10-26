#ifndef NO_MULTITHREADING
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "log.hpp"
#include "thread.hpp"

// Disable warnings for external taskflow library
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-conversion"
#pragma clang diagnostic ignored "-Wimplicit-int-float-conversion"
#pragma clang diagnostic ignored "-Wshorten-64-to-32"
#pragma clang diagnostic ignored "-Wconversion"
#include "taskflow/taskflow.hpp"
#pragma clang diagnostic pop

#include <atomic>
#include <functional>
#include <thread>
#include <vector>

namespace {

class TaskflowPool {
  public:
    TaskflowPool(size_t num_threads)
        : executor_(num_threads)
    {
    }

    TaskflowPool(const TaskflowPool& other) = delete;
    TaskflowPool(TaskflowPool&& other) = delete;
    ~TaskflowPool() = default;

    TaskflowPool& operator=(const TaskflowPool& other) = delete;
    TaskflowPool& operator=(TaskflowPool&& other) = delete;

    void start_tasks(size_t num_iterations, const std::function<void(size_t)>& func)
    {
        // Save the parent pointer for benchmark stats
        auto* parent_ptr = bb::detail::GlobalBenchStatsContainer::parent;

        // We need to use a simpler approach without for_each_index to avoid linkage issues
        // Create num_iterations tasks that will be scheduled by taskflow
        tf::Taskflow taskflow;

        for (size_t i = 0; i < num_iterations; ++i) {
            taskflow.emplace([&func, parent_ptr, i]() {
                // Preserve benchmark stats parent for nested parallel operations
                bb::detail::GlobalBenchStatsContainer::parent = parent_ptr;
                func(i);
            });
        }

        // Run the taskflow - this will block until all tasks complete
        // The executor handles work-stealing, so threads from the pool can
        // participate in nested parallel_for calls
        executor_.run(taskflow).wait();
    }

    tf::Executor& get_executor() { return executor_; }

  private:
    tf::Executor executor_;
};

} // namespace

namespace bb {
/**
 * A taskflow-based parallel_for implementation that provides proper reentrancy.
 *
 * Taskflow's executor uses a work-stealing scheduler, which means:
 * - Worker threads can participate in nested parallel_for calls
 * - If a thread is waiting for subtasks, it will steal and execute other work
 * - This avoids deadlocks and provides efficient load balancing
 *
 * This implementation is thread-safe for nested parallel_for calls.
 */
void parallel_for_taskflow(size_t num_iterations, const std::function<void(size_t)>& func)
{
    // Thread-local executor allows each thread to have its own taskflow pool
    // This is key for reentrancy: when a worker thread calls parallel_for,
    // it uses its own thread-local pool rather than blocking the parent pool
    thread_local TaskflowPool pool(bb::get_num_cpus() - 1);

    pool.start_tasks(num_iterations, func);
}
} // namespace bb
#endif
