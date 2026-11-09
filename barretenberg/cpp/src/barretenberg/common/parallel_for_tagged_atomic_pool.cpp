#include "parallel_for_tagged_atomic_pool.hpp"

#ifndef NO_MULTITHREADING
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/compiler_hints.hpp"
#include "barretenberg/common/thread.hpp"

#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstdint>
#include <limits>
#include <mutex>
#include <thread>
#include <vector>

namespace {

// Separates the hot atomics so that workers claiming iterations do not invalidate the line holding the job description.
constexpr size_t CACHE_LINE_SIZE = 64;

constexpr auto SPIN_BEFORE_BLOCKING_DURATION = std::chrono::microseconds(100);
constexpr size_t SPIN_CLOCK_INTERVAL = 64;

inline void cpu_relax()
{
#if defined(__x86_64__) || defined(__i386__)
    __builtin_ia32_pause();
#elif defined(__aarch64__)
    asm volatile("yield" ::: "memory");
#endif
}

template <typename Done> bool spin_until(const Done& done)
{
    auto deadline = std::chrono::steady_clock::now() + SPIN_BEFORE_BLOCKING_DURATION;
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

} // namespace

namespace bb::detail {

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
 * is ordered after the publication and its CAS against generation g fails. `task_` and `job_stats_parent_` are only
 * read after a successful claim and only rewritten once every iteration of the current job has completed.
 *
 * Idle workers spin briefly on `work_` before sleeping on `wake_condition_`; the caller likewise spins on `completed_`
 * before sleeping on `done_condition_`. The sleeper counts and the published state are sequentially consistent so a
 * publisher either sees a sleeper (and notifies under the mutex) or the sleeper sees the new state before blocking.
 */
class TaggedAtomicThreadPool::Impl {
  public:
    Impl(size_t num_threads);
    Impl(const Impl& other) = delete;
    Impl(Impl&& other) = delete;
    ~Impl();

    Impl& operator=(const Impl& other) = delete;
    Impl& operator=(Impl&& other) = delete;

    void start_tasks(size_t num_iterations, const std::function<void(size_t)>& func)
    {
        BB_ASSERT_LT(num_iterations, size_t{ std::numeric_limits<uint32_t>::max() });
        if (num_iterations == 0) {
            return;
        }
        job_stats_parent_.store(bb::detail::GlobalBenchStatsContainer::parent, std::memory_order_relaxed);
        task_.store(&func, std::memory_order_relaxed);
        completed_.store(0, std::memory_order_relaxed);
        BB_ASSERT_NEQ(caller_generation_, std::numeric_limits<uint32_t>::max(), "Thread pool generation exhausted");
        caller_generation_++;
        num_iterations_[caller_generation_ % 2].store(num_iterations, std::memory_order_release);
        work_.store(static_cast<uint64_t>(caller_generation_) << 32);
        if (sleeping_workers_.load() > 0) {
            std::unique_lock<std::mutex> lock(mutex_);
            wake_condition_.notify_all();
        }

        do_iterations(caller_generation_);

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
    std::atomic<bb::detail::TimeStatsEntry*> job_stats_parent_ = nullptr;
    std::atomic<size_t> sleeping_workers_ = 0;
    std::atomic<bool> caller_sleeping_ = false;
    std::atomic<bool> stop_ = false;
    uint32_t caller_generation_ = 0;
    std::vector<std::thread> workers;
    std::mutex mutex_;
    std::condition_variable wake_condition_;
    std::condition_variable done_condition_;

    BB_NO_PROFILE void worker_loop(size_t thread_index);

    static uint32_t generation_of(uint64_t work) { return static_cast<uint32_t>(work >> 32); }

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
                bb::detail::GlobalBenchStatsContainer::parent = job_stats_parent_.load(std::memory_order_relaxed);
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

TaggedAtomicThreadPool::Impl::Impl(size_t num_threads)
{
    workers.reserve(num_threads);
    for (size_t i = 0; i < num_threads; ++i) {
        workers.emplace_back(&Impl::worker_loop, this, i);
    }
}

TaggedAtomicThreadPool::Impl::~Impl()
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

void TaggedAtomicThreadPool::Impl::worker_loop([[maybe_unused]] size_t thread_index)
{
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
}

TaggedAtomicThreadPool::TaggedAtomicThreadPool(size_t num_workers)
    : impl(std::make_unique<Impl>(num_workers))
{}

TaggedAtomicThreadPool::~TaggedAtomicThreadPool() = default;

void TaggedAtomicThreadPool::run(size_t num_iterations, const std::function<void(size_t)>& func)
{
    impl->start_tasks(num_iterations, func);
}

} // namespace bb::detail

namespace bb {

void parallel_for_tagged_atomic_pool(size_t num_iterations, const std::function<void(size_t)>& func)
{
#ifdef __wasm__
#define THREAD_LOCAL_MAYBE
#else
#define THREAD_LOCAL_MAYBE thread_local
#endif

    static THREAD_LOCAL_MAYBE detail::TaggedAtomicThreadPool pool(get_num_cpus() - 1);
    static THREAD_LOCAL_MAYBE bool nested = false;

    if (nested) {
        for (size_t i = 0; i < num_iterations; ++i) {
            func(i);
        }
        return;
    }

    nested = true;
    pool.run(num_iterations, func);
    nested = false;
}

} // namespace bb
#endif
