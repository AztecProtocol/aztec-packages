#pragma once
#ifndef NO_MULTITHREADING

#include <functional>

namespace bb {

/**
 * @brief Work stealing configuration with sensible defaults
 */
struct WorkStealingSettings {
    size_t chunk_size = 64;     // Size of work chunks
    size_t min_work_size = 128; // Minimum iterations to enable work stealing

    WorkStealingSettings() = default;
    WorkStealingSettings(size_t chunk, size_t min_work)
        : chunk_size(chunk)
        , min_work_size(min_work)
    {}
};

/**
 * @brief Execute a parallel for loop with work stealing
 *
 * This function provides a work-stealing layer on top of the existing parallel_for.
 * It divides work into chunks that can be dynamically redistributed among threads
 * to handle imbalanced workloads efficiently.
 *
 * @param num_iterations Total number of iterations
 * @param func Function to execute for each iteration
 * @param settings Optional work stealing settings
 */
void parallel_for_work_stealing(size_t num_iterations,
                                const std::function<void(size_t)>& func,
                                const WorkStealingSettings& settings = {});

} // namespace bb

#endif // NO_MULTITHREADING