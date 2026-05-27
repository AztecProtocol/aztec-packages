#include "thread.hpp"
#include "bb_bench.hpp"
#include "log.hpp"
#include "throw_or_abort.hpp"
#include <atomic>
#include <barretenberg/env/hardware_concurrency.hpp>
#include <chrono>
#include <cstdlib>
#include <functional>
#include <string>

#ifndef NO_MULTITHREADING
#include <thread>
#endif

#ifndef NO_MULTITHREADING
namespace {
uint32_t& get_num_cores_ref()
{
    static thread_local const char* val = std::getenv("HARDWARE_CONCURRENCY");
    static thread_local uint32_t cores =
        val != nullptr ? static_cast<uint32_t>(std::stoul(val)) : std::min(32U, env_hardware_concurrency());
    return cores;
}
} // namespace
#endif

namespace bb {
void set_parallel_for_concurrency([[maybe_unused]] size_t num_cores)
{
#ifdef NO_MULTITHREADING
    throw_or_abort("Cannot set hardware concurrency when multithreading is disabled.");
#else
    // This is already thread-local, so setting it affects only the current thread
    get_num_cores_ref() = static_cast<uint32_t>(num_cores);
#endif
}

size_t get_num_cpus()
{
#ifdef NO_MULTITHREADING
    return 1;
#else
    return static_cast<size_t>(get_num_cores_ref());
#endif
}
} // namespace bb

#ifndef NO_MULTITHREADING

// Fix for https://github.com/AztecProtocol/aztec-packages/issues/19769
// Zig's Mach-O linker (https://codeberg.org/ziglang/zig/issues/31461) misaligns
// __thread_bss TLS template offsets when __thread_data is also present (from Rust
// static libraries), causing x86_64-macos segfaults on any thread_local requiring
// 16-byte alignment. Adding an alignas(16) initialized thread_local forces
// __thread_data alignment to 16, ensuring __thread_bss starts at a correctly
// aligned TLS template offset.
// NOLINTBEGIN
alignas(16) thread_local char bb_thread_tls_alignment_pad[16] __attribute__((used)) = { 1 };
// NOLINTEND

namespace bb::detail {

// THREAD_LOCAL_MAYBE: thread_local on native, plain static on wasm. WASM thread_local
// for non-trivial types has bad init/teardown semantics inside wasi-threads workers,
// so the pool is process-wide there — wasm only has one master thread dispatching
// parallel_for at any time.
#ifdef __wasm__
#define BB_TLS
#else
#define BB_TLS thread_local
#endif

/**
 * @brief Generation-counter thread pool backing bb::parallel_for.
 *
 * Lock-free hot path: start_tasks() bumps generation_ (release); workers
 * acquire-load generation_, then each iteration claim is a single fetch_add
 * on iteration_. Cross-call safety is via workers_done_gen_: every worker
 * bumps it after finishing the current generation, and start_tasks() waits
 * for it to reach num_workers_ before returning, guaranteeing no worker is
 * still inside do_iterations() when the next generation is published.
 *
 * Idle wait is yield-spin then 100 us sleep_for fallback on native. Browser WASM
 * keeps yielding because std::this_thread::sleep_for lowers to WASI poll_oneoff,
 * which is intentionally stubbed out in this build. Neither path lowers to
 * i32.atomic.wait, so the V8 wasi-threads lost-wakeup race that affects
 * condition_variable-based pools does not apply here.
 *
 * This is the same design as the round-parallel MSM's local pool — the MSM
 * dispatches parallel_for hundreds of times per proof, and per-call overhead
 * (mutex/condvar) was the dominant cost on heterogeneous P/E hosts and on
 * WASM. The pool below is the single backbone for every bb::parallel_for
 * caller in the codebase.
 */
class ParallelForPool {
  public:
    explicit ParallelForPool(size_t num_threads);
    ParallelForPool(const ParallelForPool&) = delete;
    ParallelForPool(ParallelForPool&&) = delete;
    ParallelForPool& operator=(const ParallelForPool&) = delete;
    ParallelForPool& operator=(ParallelForPool&&) = delete;
    ~ParallelForPool();

    void start_tasks(size_t num_iterations, const std::function<void(size_t)>& func)
    {
        bench_parent_.store(bb::detail::GlobalBenchStatsContainer::parent, std::memory_order_relaxed);
        // Safe to write task_/counters here without synchronisation: the prior
        // start_tasks() waited for every worker to bump workers_done_gen_, so no
        // worker is currently reading task_ or iteration_.
        task_ = func;
        iteration_.store(0, std::memory_order_relaxed);
        num_iterations_.store(num_iterations, std::memory_order_relaxed);
        workers_done_gen_.store(0, std::memory_order_relaxed);
        // Release publishes task_ + counters to workers acquire-loading generation_.
        generation_.fetch_add(1, std::memory_order_release);

        do_iterations();

        idle_wait_until([this] { return workers_done_gen_.load(std::memory_order_acquire) == num_workers_; });
        std::atomic_thread_fence(std::memory_order_acquire);
    }

  private:
    std::vector<std::thread> workers_;
    std::function<void(size_t)> task_;
    size_t num_workers_;

    alignas(64) std::atomic<size_t> num_iterations_{ 0 };
    alignas(64) std::atomic<size_t> iteration_{ 0 };
    alignas(64) std::atomic<size_t> generation_{ 0 };
    alignas(64) std::atomic<size_t> workers_done_gen_{ 0 };
    alignas(64) std::atomic<bb::detail::TimeStatsEntry*> bench_parent_{ nullptr };
    std::atomic<bool> stop_{ false };

    void worker_loop();

    BB_NO_PROFILE void do_iterations()
    {
        const size_t total = num_iterations_.load(std::memory_order_relaxed);
        size_t i = 0;
        while ((i = iteration_.fetch_add(1, std::memory_order_relaxed)) < total) {
            task_(i);
        }
    }

    template <typename Pred> static void idle_wait_until(Pred pred)
    {
        for (int s = 0; s < 1024; ++s) {
            if (pred()) {
                return;
            }
            std::this_thread::yield();
        }
        while (!pred()) {
#ifdef __wasm__
            std::this_thread::yield();
#else
            std::this_thread::sleep_for(std::chrono::microseconds(100));
#endif
        }
    }
};

ParallelForPool::ParallelForPool(size_t num_threads)
    : num_workers_(num_threads)
{
    workers_.reserve(num_threads);
    for (size_t i = 0; i < num_threads; ++i) {
        workers_.emplace_back([this] { worker_loop(); });
    }
}

ParallelForPool::~ParallelForPool()
{
    stop_.store(true, std::memory_order_release);
    for (auto& w : workers_) {
        w.join();
    }
}

void ParallelForPool::worker_loop()
{
    size_t my_gen = 0;
    int idle_spins = 0;
    while (!stop_.load(std::memory_order_acquire)) {
        const size_t cur_gen = generation_.load(std::memory_order_acquire);
        if (cur_gen != my_gen) {
            my_gen = cur_gen;
            idle_spins = 0;
            // Inherit master's BB_BENCH_NAME parent so any BB_BENCH_NAME hit inside
            // `task_` attributes to the master's bench stack rather than nullptr.
            bb::detail::GlobalBenchStatsContainer::parent = bench_parent_.load(std::memory_order_relaxed);
            do_iterations();
            workers_done_gen_.fetch_add(1, std::memory_order_release);
        } else if (idle_spins < 1024) {
            ++idle_spins;
            std::this_thread::yield();
        } else {
#ifdef __wasm__
            std::this_thread::yield();
#else
            std::this_thread::sleep_for(std::chrono::microseconds(100));
#endif
        }
    }
}

inline ParallelForPool& shared_pool()
{
    // Pool sized to (get_num_cpus() - 1) workers; the master doubles as the last
    // worker so total active threads = get_num_cpus().
    static BB_TLS ParallelForPool pool(get_num_cpus() == 0 ? 0 : get_num_cpus() - 1);
    return pool;
}

// Nested parallel_for guard. The pool is single-master-safe only — a worker calling
// parallel_for again would race on its master's pool state. We fall back to serial
// in nested calls, matching the behaviour of the prior parallel_for_mutex_pool.
BB_TLS bool nested_parallel_for = false;

// Pool backend selector. Default is the generation-counter pool; set the env var
// BB_PARALLEL_POOL=mutex to fall back to the legacy std::mutex/condition_variable pool
// (defined in parallel_for_mutex_pool.cpp). Read once at first dispatch so the choice is
// fixed for the process — toggling without a rebuild lets the same binary be A/B-benched
// across devices (e.g. browserstack) where the generation pool's idle-wait / oversubscription
// behaviour was observed to differ. Values other than "mutex" select the generation pool.
enum class PoolStrategy : uint8_t { Generation, Mutex, Atomic };
inline PoolStrategy pool_strategy()
{
    static const PoolStrategy strategy = [] {
        const char* env = std::getenv("BB_PARALLEL_POOL");
        if (env == nullptr) {
            return PoolStrategy::Generation;
        }
        const std::string val(env);
        if (val == "mutex") {
            return PoolStrategy::Mutex;
        }
        if (val == "atomic") {
            return PoolStrategy::Atomic;
        }
        return PoolStrategy::Generation;
    }();
    return strategy;
}

} // namespace bb::detail

#endif // NO_MULTITHREADING

namespace bb {

// Legacy std::mutex/condition_variable pool — defined in parallel_for_mutex_pool.cpp,
// selected at runtime via BB_PARALLEL_POOL=mutex. It handles its own nested-call guard
// and serial fallback, so dispatch to it directly.
void parallel_for_mutex_pool(size_t num_iterations, const std::function<void(size_t)>& func);
void parallel_for_atomic_pool(size_t num_iterations, const std::function<void(size_t)>& func);

void parallel_for(size_t num_iterations, const std::function<void(size_t)>& func)
{
#ifdef NO_MULTITHREADING
    for (size_t i = 0; i < num_iterations; ++i) {
        func(i);
    }
#else
    if (num_iterations == 0) {
        return;
    }
    if (detail::pool_strategy() == detail::PoolStrategy::Mutex) {
        parallel_for_mutex_pool(num_iterations, func);
        return;
    }
    if (detail::pool_strategy() == detail::PoolStrategy::Atomic) {
        parallel_for_atomic_pool(num_iterations, func);
        return;
    }
    // Honour callers that gate nested parallelism via set_parallel_for_concurrency(1)
    // (e.g. the chonk batch verifier setting this on each outer worker thread). Fall
    // back to a serial loop on the calling thread instead of dispatching to the pool —
    // the pool's generation-counter dispatch is single-master-safe only, so concurrent
    // dispatches from sibling outer threads would race on its state.
    if (get_num_cpus() <= 1 || detail::nested_parallel_for) {
        for (size_t i = 0; i < num_iterations; ++i) {
            func(i);
        }
        return;
    }
    detail::nested_parallel_for = true;
    detail::shared_pool().start_tasks(num_iterations, func);
    detail::nested_parallel_for = false;
#endif
}

/**
 * @brief Split a loop into several loops running in parallel
 *
 * @details Splits the num_points into appropriate number of chunks to do parallel processing on and calls the function
 * that should contain the work loop
 * @param num_points Total number of elements
 * @param func A function or lambda expression with a for loop inside, for example:
 * [](size_t start, size_t end){for (size_t i=start; i<end; i++){(void)i;}}
 * @param no_multhreading_if_less_or_equal If num points is less or equal to this value, run without parallelization
 *
 */
void parallel_for_range(size_t num_points,
                        const std::function<void(size_t, size_t)>& func,
                        size_t no_multhreading_if_less_or_equal)
{
    if (num_points <= no_multhreading_if_less_or_equal) {
        func(0, num_points);
        return;
    }
    // Get number of cpus we can split into
    const size_t num_cpus = get_num_cpus();

    // Compute the size of a single chunk
    const size_t chunk_size = (num_points / num_cpus) + (num_points % num_cpus == 0 ? 0 : 1);
    // Parallelize over chunks
    parallel_for(num_cpus, [num_points, chunk_size, &func](size_t chunk_index) {
        // If num_points is small, sometimes we need fewer CPUs
        if (chunk_size * chunk_index > num_points) {
            return;
        }
        // Compute the current chunk size (can differ in case it's the last chunk)
        size_t current_chunk_size = std::min(num_points - (chunk_size * chunk_index), chunk_size);
        if (current_chunk_size == 0) {
            return;
        }
        size_t start = chunk_index * chunk_size;
        size_t end = chunk_index * chunk_size + current_chunk_size;
        func(start, end);
    });
};

void parallel_for_heuristic(size_t num_points,
                            const std::function<void(size_t, size_t, size_t)>& func,
                            size_t heuristic_cost)
{
    using namespace thread_heuristics;
    // Get number of cpus we can split into
    const size_t num_cpus = get_num_cpus();

    // Compute the size of a single chunk
    const size_t chunk_size = (num_points / num_cpus) + (num_points % num_cpus == 0 ? 0 : 1);

    // Compute the cost of all operations done by other threads
    const size_t offset_cost = (num_points - chunk_size) * heuristic_cost;

    // If starting parallel for is longer than computing, just compute
    if (offset_cost < PARALLEL_FOR_COST) {
        func(0, num_points, 0);
        return;
    }
    // Parallelize over chunks
    parallel_for(num_cpus, [num_points, chunk_size, &func](size_t chunk_index) {
        // If num_points is small, sometimes we need fewer CPUs
        if ((chunk_size * chunk_index) > num_points) {
            return;
        }
        // Compute the current chunk size (can differ in case it's the last chunk)
        const size_t current_chunk_size = std::min(num_points - (chunk_size * chunk_index), chunk_size);
        if (current_chunk_size == 0) {
            return;
        }
        const size_t start = chunk_index * chunk_size;
        const size_t end = start + current_chunk_size;
        func(start, end, chunk_index);
    });
};

MultithreadData calculate_thread_data(size_t num_iterations, size_t min_iterations_per_thread)
{
    size_t num_threads = calculate_num_threads(num_iterations, min_iterations_per_thread);
    const size_t thread_size = num_iterations / num_threads;

    // Cumpute the index bounds for each thread
    std::vector<size_t> start(num_threads);
    std::vector<size_t> end(num_threads);
    for (size_t thread_idx = 0; thread_idx < num_threads; ++thread_idx) {
        start[thread_idx] = thread_idx * thread_size;
        end[thread_idx] = (thread_idx == num_threads - 1) ? num_iterations : (thread_idx + 1) * thread_size;
    }

    return MultithreadData{ num_threads, start, end };
}

/**
 * @brief calculates number of threads to create based on minimum iterations per thread
 * @details Finds the number of cpus with get_num_cpus(), and calculates `desired_num_threads`
 * Returns the min of `desired_num_threads` and `max_num_threads`.
 *
 * @param num_iterations
 * @param min_iterations_per_thread
 * @return size_t
 */
size_t calculate_num_threads(size_t num_iterations, size_t min_iterations_per_thread)
{
    size_t max_num_threads = get_num_cpus(); // number of available threads
    size_t desired_num_threads = num_iterations / min_iterations_per_thread;
    size_t num_threads = std::min(desired_num_threads, max_num_threads); // fewer than max if justified
    num_threads = num_threads > 0 ? num_threads : 1;                     // ensure num_threads is at least 1
    return num_threads;
}

} // namespace bb
