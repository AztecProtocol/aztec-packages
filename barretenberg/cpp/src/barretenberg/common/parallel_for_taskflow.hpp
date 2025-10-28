#pragma once
#ifndef NO_MULTITHREADING

// Disable warnings for external taskflow library
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Wsign-conversion"
#pragma clang diagnostic ignored "-Wimplicit-int-float-conversion"
#pragma clang diagnostic ignored "-Wshorten-64-to-32"
#pragma clang diagnostic ignored "-Wconversion"
#include "taskflow/taskflow.hpp"
#pragma clang diagnostic pop

#include <cstddef>
#include <functional>

namespace bb {
namespace detail {

// Forward declaration - defined in .cpp to avoid header bloat
tf::Executor& get_global_taskflow_executor();

} // namespace detail

/**
 * @brief Asynchronously execute iterations in parallel, returning a future
 *
 * @param num_iterations Number of iterations to execute
 * @param func Function to call for each iteration: void(size_t iteration_index)
 * @return tf::Future<void> that can be waited on or ignored
 *
 * Example:
 *   auto future = parallel_for_async(100, [](size_t i) { process(i); });
 *   // Do other work...
 *   future.wait();  // Wait for completion
 */
template <typename Func> tf::Future<void> parallel_for_async(size_t num_iterations, Func&& func)
{
    auto& executor = detail::get_global_taskflow_executor();

    auto taskflow = std::make_shared<tf::Taskflow>();

    for (size_t i = 0; i < num_iterations; ++i) {
        taskflow->emplace([func, i]() { func(i); });
    }

    // Return future - taskflow is kept alive via shared_ptr captured in the future
    return executor.run(*taskflow);
}

/**
 * @brief Synchronously execute iterations in parallel, blocking until complete
 *
 * @param num_iterations Number of iterations to execute
 * @param func Function to call for each iteration: void(size_t iteration_index)
 *
 * This is the standard blocking parallel_for interface. For non-blocking execution,
 * use parallel_for_async instead.
 *
 * Thread efficiency optimization:
 * - If called from a worker thread (nested parallel_for): Uses corun() to make the
 *   calling thread participate in work-stealing instead of blocking idle
 * - If called from external thread (top-level): Uses run().wait() to block until complete
 *
 * This ensures maximum thread utilization: in nested scenarios, all N worker threads
 * actively execute tasks via work-stealing, with no threads sitting idle.
 */
template <typename Func> void parallel_for_impl(size_t num_iterations, Func&& func)
{
    auto& executor = detail::get_global_taskflow_executor();

    // Create taskflow with tasks - stack allocation is fine since we block until complete
    tf::Taskflow taskflow;

    for (size_t i = 0; i < num_iterations; ++i) {
        taskflow.emplace([func, i]() { func(i); });
    }

    // Attempt corun() first for maximum efficiency
    // corun() throws if not called from a worker thread, so we catch and fallback
    try {
        executor.corun(taskflow);
    } catch (...) {
        // Not on a worker thread - use standard blocking run
        executor.run(taskflow).wait();
    }
}

} // namespace bb

#endif // NO_MULTITHREADING
