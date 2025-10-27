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

// Get the global shared executor - all parallel_for calls use the same thread pool
tf::Executor& get_global_executor() {
    static tf::Executor executor(bb::get_num_cpus());
    return executor;
}

} // namespace

namespace bb {
/**
 * A taskflow-based parallel_for implementation that provides proper reentrancy.
 *
 * Key design:
 * - Uses a SINGLE shared executor with N threads (where N = num_cpus)
 * - All parallel_for calls (including nested ones) submit tasks to the same executor
 * - The same N worker threads handle all work, parent and nested tasks alike
 * - Taskflow's work-stealing scheduler ensures threads don't sit idle
 * - No thread explosion: always exactly N threads regardless of nesting depth
 *
 * Thread reentrancy mechanism:
 * - When a worker thread T submits a nested parallel_for, it creates a taskflow
 *   and submits it to the same executor it belongs to
 * - T then waits (blocks) for the nested work to complete
 * - While T is blocked, OTHER worker threads from the same pool steal and execute
 *   the nested tasks (and T's siblings tasks)
 * - Once all nested tasks finish, T unblocks and continues
 * - This works because we have N threads and typically N-1 are available to handle
 *   work while 1 is blocked waiting
 */
void parallel_for_taskflow(size_t num_iterations, const std::function<void(size_t)>& func)
{
    // Get the shared global executor
    tf::Executor& executor = get_global_executor();

    // Save the parent pointer for benchmark stats
    auto* parent_ptr = bb::detail::GlobalBenchStatsContainer::parent;

    // Create a taskflow with num_iterations independent tasks
    tf::Taskflow taskflow;

    for (size_t i = 0; i < num_iterations; ++i) {
        taskflow.emplace([&func, parent_ptr, i]() {
            // Preserve benchmark stats parent for nested parallel operations
            bb::detail::GlobalBenchStatsContainer::parent = parent_ptr;
            func(i);
        });
    }

    // Submit to the shared executor and wait for completion
    // If we're already inside a worker thread, this will block this thread
    // while other workers handle the tasks via work-stealing
    executor.run(taskflow).wait();
}
} // namespace bb
#endif
