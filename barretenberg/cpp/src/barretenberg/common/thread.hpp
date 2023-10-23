#pragma once
#include <atomic>
#include <barretenberg/env/hardware_concurrency.hpp>
#include <barretenberg/numeric/bitop/get_msb.hpp>
#include <functional>
#include <iostream>
#include <thread>
#include <vector>

inline size_t get_num_cpus()
{
#ifdef NO_MULTITHREADING
    return 1;
#else
    return env_hardware_concurrency();
#endif
}

// For algorithms that need to be divided amongst power of 2 threads.
inline size_t get_num_cpus_pow2()
{
    return static_cast<size_t>(1ULL << numeric::get_msb(get_num_cpus()));
}

void parallel_for(size_t num_iterations, const std::function<void(size_t)>& func);

/**
 * A modified parallel_for optimized for work being done in batches.
 * This is more appropriate for work with small granularity, to avoid thread caching issues and overhead.
 */
inline void parallel_for_batched(size_t num_iterations, auto&& func, size_t min_num_iterations = 800)
{
    if (num_iterations <= min_num_iterations) {
        // Don't bother with overhead of splitting into threads if small
        for (size_t i = 0; i < num_iterations; i++) {
            func(i);
        }
        return;
    }
    size_t num_threads = get_num_cpus_pow2();
    size_t batch_size = (num_iterations + num_threads - 1) / num_threads; // round up division
    // We will use parallel_for to dispatch the batches
    parallel_for(num_threads, [&](size_t thread_idx) {
        // Calculate start and end for this batch
        size_t start = thread_idx * batch_size;
        size_t end = std::min(start + batch_size, num_iterations);

        for (size_t i = start; i < end; ++i) {
            func(i);
        }
    });
}