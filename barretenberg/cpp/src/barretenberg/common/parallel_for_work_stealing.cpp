#ifndef NO_MULTITHREADING
#include "parallel_for_work_stealing.hpp"
#include "thread.hpp"
#include <atomic>
#include <deque>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace bb {

namespace {

// Work chunk representing a range of iterations
struct WorkChunk {
    size_t start;
    size_t end;

    size_t size() const { return end - start; }
    bool empty() const { return start >= end; }
};

// Thread-safe work queue with stealing support
class alignas(64) WorkQueue { // Cache line alignment to avoid false sharing
    mutable std::mutex mutex_;
    std::deque<WorkChunk> chunks_;

  public:
    // Try to get work from the front (owner thread access pattern)
    bool try_pop(WorkChunk& chunk)
    {
        std::lock_guard lock(mutex_);
        if (chunks_.empty()) {
            return false;
        }
        chunk = chunks_.front();
        chunks_.pop_front();
        return true;
    }

    // Try to steal half the work from the back (thief thread access pattern)
    bool try_steal_half(std::vector<WorkChunk>& stolen)
    {
        std::lock_guard lock(mutex_);

        size_t num_chunks = chunks_.size();
        if (num_chunks <= 1) {
            return false;
        }

        // Steal half of the chunks from the back
        size_t steal_count = num_chunks / 2;
        stolen.resize(steal_count);

        for (size_t i = 0; i < steal_count; ++i) {
            stolen[i] = chunks_.back();
            chunks_.pop_back();
        }

        return true;
    }

    // Initialize with a range of work
    void push_range(size_t start, size_t end, size_t chunk_size)
    {
        for (size_t i = start; i < end; i += chunk_size) {
            chunks_.push_back({ i, std::min(i + chunk_size, end) });
        }
    }

    bool empty() const
    {
        std::lock_guard lock(mutex_);
        return chunks_.empty();
    }
};

// Worker function that processes local work then steals from others
void process_work_with_stealing(size_t thread_id,
                                WorkQueue& my_queue,
                                const std::vector<std::unique_ptr<WorkQueue>>& all_queues,
                                const std::function<void(size_t)>& func,
                                std::atomic<bool>& work_available)
{
    // Process local work first
    WorkChunk chunk;
    while (my_queue.try_pop(chunk)) {
        for (size_t i = chunk.start; i < chunk.end; ++i) {
            func(i);
        }
    }

    // Steal work from others
    std::vector<WorkChunk> stolen_chunks;
    size_t steal_attempts = 0;

    while (work_available.load(std::memory_order_relaxed)) {
        // Try to steal from other threads using round-robin with hash-based offset
        size_t attempts = 0;
        bool found_work = false;

        while (attempts++ < all_queues.size() * 2 && !found_work) {
            // Use a simple hash to create pseudo-random but deterministic victim selection
            // This avoids the overhead of RNG initialization
            size_t victim_id = (thread_id + attempts + (steal_attempts * 7)) % all_queues.size();
            if (victim_id == thread_id) {
                continue;
            }

            if (all_queues[victim_id]->try_steal_half(stolen_chunks)) {
                // Process stolen work
                for (const auto& stolen : stolen_chunks) {
                    for (size_t i = stolen.start; i < stolen.end; ++i) {
                        func(i);
                    }
                }
                found_work = true;
            }
        }

        steal_attempts++;

        if (!found_work) {
            // Check if any work remains
            bool any_work = false;
            for (const auto& queue : all_queues) {
                if (!queue->empty()) {
                    any_work = true;
                    break;
                }
            }

            if (!any_work) {
                work_available.store(false, std::memory_order_relaxed);
                break;
            }

            std::this_thread::yield();
        }
    }
}

} // anonymous namespace

void parallel_for_work_stealing(size_t num_iterations,
                                const std::function<void(size_t)>& func,
                                const WorkStealingSettings& settings)
{
    // Fall back to regular parallel_for for small workloads
    if (num_iterations < settings.min_work_size) {
        parallel_for(num_iterations, func);
        return;
    }

    const size_t num_threads = get_num_cpus();

    // Create and initialize work queues
    std::vector<std::unique_ptr<WorkQueue>> work_queues;
    work_queues.reserve(num_threads);

    for (size_t i = 0; i < num_threads; ++i) {
        work_queues.push_back(std::make_unique<WorkQueue>());
    }

    // Distribute initial work evenly
    size_t iterations_per_thread = num_iterations / num_threads;
    size_t remainder = num_iterations % num_threads;
    size_t current = 0;

    for (size_t i = 0; i < num_threads; ++i) {
        size_t thread_iterations = iterations_per_thread + (i < remainder ? 1 : 0);
        if (thread_iterations > 0) {
            work_queues[i]->push_range(current, current + thread_iterations, settings.chunk_size);
            current += thread_iterations;
        }
    }

    // Track if work is still available
    std::atomic<bool> work_available{ true };

    // Execute work in parallel with stealing
    parallel_for(num_threads, [&](size_t thread_id) {
        process_work_with_stealing(thread_id, *work_queues[thread_id], work_queues, func, work_available);
    });
}

} // namespace bb

#endif // NO_MULTITHREADING