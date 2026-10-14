#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#ifndef NO_MULTITHREADING
#include "log.hpp"
#include "thread.hpp"
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <functional>
#include <limits>
#include <mutex>
#include <thread>
#include <vector>

#include "barretenberg/common/compiler_hints.hpp"

// Fix for https://github.com/AztecProtocol/aztec-packages/issues/19769
// Zig's Mach-O linker (https://codeberg.org/ziglang/zig/issues/31461) misaligns
// __thread_bss TLS template offsets when __thread_data is also present (from Rust
// static libraries), causing x86_64-macos segfaults on any thread_local requiring
// 16-byte alignment (e.g. std::mutex). Adding an alignas(16) initialized
// thread_local forces __thread_data alignment to 16, ensuring __thread_bss starts
// at a correctly aligned TLS template offset.
// NOLINTBEGIN
alignas(16) thread_local char tls_alignment_pad[16] __attribute__((used)) = { 1 };
// NOLINTEND

namespace {

// Separates the hot atomics so that workers claiming iterations do not invalidate the line holding the job description.
constexpr size_t CACHE_LINE_SIZE = 64;

// How long an idle thread busy-waits for the next job (workers) or for the job to finish (caller) before blocking on a
// condition variable. Provers issue thousands of short parallel_for calls back to back (sumcheck rounds, MSM stages,
// per-polynomial loops); waking a blocked thread costs tens of microseconds, which is comparable to the work itself.
constexpr auto SPIN_DURATION = std::chrono::microseconds(100);
// The clock is only read once every SPIN_CLOCK_INTERVAL spins.
constexpr size_t SPIN_CLOCK_INTERVAL = 64;

inline void cpu_relax()
{
#if defined(__x86_64__) || defined(__i386__)
    __builtin_ia32_pause();
#elif defined(__aarch64__)
    asm volatile("yield" ::: "memory");
#endif
}

/**
 * @brief Busy-waits until `done()` holds or SPIN_DURATION elapses.
 * @return true if `done()` holds.
 */
template <typename Done> bool spin_until(const Done& done)
{
    auto deadline = std::chrono::steady_clock::now() + SPIN_DURATION;
    for (size_t spins = 1;; ++spins) {
        if (done()) {
            return true;
        }
        if (spins % SPIN_CLOCK_INTERVAL == 0 && std::chrono::steady_clock::now() >= deadline) {
            return done();
        }
        cpu_relax();
    }
}

/**
 * @brief A pool of persistent workers that run the iterations of one parallel_for at a time together with the calling
 * thread.
 *
 * @details A job is published through `work_`, which packs a 32-bit job generation (high half) with the index of the
 * next unclaimed iteration (low half). Threads claim iterations by CAS on `work_`; a claim only succeeds while its
 * generation is current, so a thread that is late to a finished job can never claim an iteration of a newer one.
 * The bound checked before the CAS is read from `num_iterations_[generation % 2]`: the caller writes the next job's
 * bound into the other slot, so a late thread still reads its own job's bound. The slot of generation g is rewritten
 * (with release) only for generation g + 2, after generation g + 1 was published; a thread that acquires that value
 * is ordered after the publication and its CAS against generation g fails. `task_` and `parent_` are only read after
 * a successful claim and only rewritten once every iteration of the current job has completed.
 *
 * Idle workers spin briefly on `work_` before sleeping on `wake_condition_`; the caller likewise spins on `completed_`
 * before sleeping on `done_condition_`. The sleeper counts and the published state are sequentially consistent so a
 * publisher either sees a sleeper (and notifies under the mutex) or the sleeper sees the new state before blocking.
 */
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
        BB_ASSERT_LT(num_iterations, size_t{ std::numeric_limits<uint32_t>::max() });
        if (num_iterations == 0) {
            return;
        }
        parent_.store(bb::detail::GlobalBenchStatsContainer::parent, std::memory_order_relaxed);
        task_.store(&func, std::memory_order_relaxed);
        completed_.store(0, std::memory_order_relaxed);
        generation_++;
        num_iterations_[generation_ % 2].store(num_iterations, std::memory_order_release);
        work_.store(static_cast<uint64_t>(generation_) << 32);
        if (sleeping_workers_.load() > 0) {
            std::unique_lock<std::mutex> lock(mutex_);
            wake_condition_.notify_all();
        }

        do_iterations(generation_);

        auto done = [&] { return completed_.load() == num_iterations; };
        if (!spin_until(done)) {
            std::unique_lock<std::mutex> lock(mutex_);
            caller_sleeping_.store(true);
            done_condition_.wait(lock, done);
            caller_sleeping_.store(false);
        }
    }

  private:
    alignas(CACHE_LINE_SIZE) std::atomic<uint64_t> work_ = 0;
    alignas(CACHE_LINE_SIZE) std::atomic<size_t> completed_ = 0;
    alignas(CACHE_LINE_SIZE) std::atomic<const std::function<void(size_t)>*> task_ = nullptr;
    std::array<std::atomic<size_t>, 2> num_iterations_{};
    std::atomic<bb::detail::TimeStatsEntry*> parent_ = nullptr;
    std::atomic<size_t> sleeping_workers_ = 0;
    std::atomic<bool> caller_sleeping_ = false;
    std::atomic<bool> stop_ = false;
    // Only accessed by the owning (calling) thread.
    uint32_t generation_ = 0;
    std::vector<std::thread> workers;
    std::mutex mutex_;
    std::condition_variable wake_condition_;
    std::condition_variable done_condition_;

    BB_NO_PROFILE void worker_loop(size_t thread_index);

    static uint32_t generation_of(uint64_t work) { return static_cast<uint32_t>(work >> 32); }

    /**
     * @brief Claims and runs iterations of job `generation` until none are left.
     * @return Whether at least one iteration was claimed.
     */
    bool do_iterations(uint32_t generation)
    {
        bool claimed_any = false;
        uint64_t work = work_.load(std::memory_order_acquire);
        while (true) {
            if (generation_of(work) != generation) {
                return claimed_any;
            }
            const size_t num_iterations = num_iterations_[generation % 2].load(std::memory_order_acquire);
            const auto iteration = static_cast<size_t>(static_cast<uint32_t>(work));
            if (iteration >= num_iterations) {
                return claimed_any;
            }
            if (!work_.compare_exchange_weak(work, work + 1, std::memory_order_acq_rel, std::memory_order_acquire)) {
                continue;
            }
            if (!claimed_any) {
                claimed_any = true;
                // Make sure nested stats accounting works under multithreading
                // Note: parent is a thread-local variable.
                bb::detail::GlobalBenchStatsContainer::parent = parent_.load(std::memory_order_relaxed);
            }
            (*task_.load(std::memory_order_relaxed))(iteration);
            if (completed_.fetch_add(1) + 1 == num_iterations && caller_sleeping_.load()) {
                std::unique_lock<std::mutex> lock(mutex_);
                done_condition_.notify_one();
            }
            work = work_.load(std::memory_order_acquire);
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
        std::unique_lock<std::mutex> lock(mutex_);
        stop_.store(true);
    }
    wake_condition_.notify_all();
    for (auto& worker : workers) {
        worker.join();
    }
}

void ThreadPool::worker_loop([[maybe_unused]] size_t thread_index)
{
    // info("created worker ", thread_index);
    uint32_t seen_generation = 0;
    while (true) {
        auto has_new_job = [&] { return generation_of(work_.load()) != seen_generation || stop_.load(); };
        if (!spin_until(has_new_job)) {
            std::unique_lock<std::mutex> lock(mutex_);
            sleeping_workers_++;
            wake_condition_.wait(lock, has_new_job);
            sleeping_workers_--;
        }
        if (stop_.load()) {
            break;
        }
        seen_generation = generation_of(work_.load(std::memory_order_acquire));
        do_iterations(seen_generation);
    }
    // info("worker exit ", worker_num);
}
} // namespace

namespace bb {
/**
 * A thread pooled strategy with lock-free iteration claiming. Each worker claims the next iteration and processes it.
 * The main thread acts as a worker also, and when it completes, it spins (then sleeps) until thread workers are done.
 */
void parallel_for_mutex_pool(size_t num_iterations, const std::function<void(size_t)>& func)
{
#ifdef __wasm__
#define THREAD_LOCAL_MAYBE
#else
#define THREAD_LOCAL_MAYBE thread_local
#endif

    static THREAD_LOCAL_MAYBE ThreadPool pool(get_num_cpus() - 1);
    static THREAD_LOCAL_MAYBE bool nested = false;

    // If nested, fall back to serial execution
    if (nested) {
        for (size_t i = 0; i < num_iterations; ++i) {
            func(i);
        }
        return;
    }

    nested = true;
    pool.start_tasks(num_iterations, func);
    nested = false;
}
} // namespace bb
#endif
