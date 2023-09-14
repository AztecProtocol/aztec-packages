#include "thread_utils.hpp"

/**
 * @brief calculates number of threads to create based on minimum iterations per thread
 * @details Finds the number of cpus with get_num_cpus(), and calculates `desired_num_threads`
 * Returns the min of `desired_num_threads` and `max_num_theads`.
 * Note that it will not calculate a power of 2 necessarily, use `calc_num_threads_pow2` instead
 *
 * @param num_iterations
 * @param min_iterations_per_thread
 * @return size_t
 */
size_t calc_num_threads(size_t num_iterations, size_t min_iterations_per_thread)
{
    size_t max_num_threads = get_num_cpus(); // number of available threads
    size_t desired_num_threads = num_iterations / min_iterations_per_thread;
    size_t num_threads = std::min(desired_num_threads, max_num_threads); // fewer than max if justified
    num_threads = num_threads > 0 ? num_threads : 1;
    return num_threads;
}