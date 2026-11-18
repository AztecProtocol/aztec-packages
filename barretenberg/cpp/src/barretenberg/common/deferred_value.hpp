#pragma once
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include <algorithm>
#include <cstddef>
#include <memory>
#include <optional>
#include <utility>

// wasm runs inline even with threads: its parallel_for pool is one process-wide pool, not one per calling thread.
#if !defined(NO_MULTITHREADING) && !defined(__wasm__)
#define BB_DEFERRED_VALUE_THREADED 1
#include <exception>
#include <mutex>
#include <thread>
#endif

namespace bb {

// With glibc's allocator, where this was measured, each pool worker allocates from a malloc arena of its own, which
// keeps its memory after the task ends; a task beside the launching thread's own work gains little from a wider pool.
inline constexpr size_t MAX_BACKGROUND_TASK_THREADS = 16;

/**
 * @brief The parallel_for thread count of a background task: that of the thread launching it, at most
 * MAX_BACKGROUND_TASK_THREADS.
 * @details The count is per thread and a new thread starts from the process default, so a run limited to k threads
 * stays limited to k only if the task is handed k explicitly.
 */
inline size_t background_task_concurrency()
{
    return std::min(get_num_cpus(), MAX_BACKGROUND_TASK_THREADS);
}

/**
 * @brief The result of a callable run on a thread of its own, shared by every copy of the handle.
 * @details The thread is joined by `get()` or, at the latest, when the last copy of the handle is destroyed, so the
 * callable must own everything it reads. Without native threads the callable runs inside `launch`.
 */
template <typename T> class DeferredValue {
  public:
    DeferredValue() = default;

    template <typename Fn> static DeferredValue launch(Fn&& fn)
    {
        DeferredValue handle;
        handle.state_ = std::make_shared<State>();
#ifdef BB_DEFERRED_VALUE_THREADED
        State* state = handle.state_.get();
        const size_t num_threads = background_task_concurrency();
        state->worker = std::thread([state, num_threads, fn = std::forward<Fn>(fn)]() mutable {
            set_parallel_for_concurrency(num_threads);
#ifdef __cpp_exceptions
            try {
                state->value.emplace(fn());
            } catch (...) {
                state->error = std::current_exception();
            }
#else
            state->value.emplace(fn());
#endif
        });
#else
        handle.state_->value.emplace(fn());
#endif
        return handle;
    }

    bool valid() const { return state_ != nullptr; }

    /**
     * @brief Waits for the callable and returns its value, or rethrows what it threw.
     */
    const T& get() const
    {
        BB_ASSERT(valid(), "DeferredValue::get() called on an empty handle");
        State& state = *state_;
#ifdef BB_DEFERRED_VALUE_THREADED
        {
            std::lock_guard<std::mutex> lock(state.join_mutex);
            if (state.worker.joinable()) {
                state.worker.join();
            }
        }
#ifdef __cpp_exceptions
        if (state.error) {
            std::rethrow_exception(state.error);
        }
#endif
#endif
        return *state.value;
    }

  private:
    struct State {
        std::optional<T> value;
#ifdef BB_DEFERRED_VALUE_THREADED
        std::exception_ptr error;
        std::mutex join_mutex;
        std::thread worker;

        State() = default;
        State(const State&) = delete;
        State(State&&) = delete;
        State& operator=(const State&) = delete;
        State& operator=(State&&) = delete;
        ~State()
        {
            if (worker.joinable()) {
                worker.join();
            }
        }
#endif
    };

    std::shared_ptr<State> state_;
};

/**
 * @brief Waits for `pending` if it is set, copies its value into an empty `target`, and clears `pending`.
 * @details Whoever sets a pending value clears `target`, so a non-empty `target` was assigned after it and is kept, as
 * the later of two assignments. Rethrows what the pending callable threw.
 */
template <typename T> const T& resolve_into(T& target, DeferredValue<T>& pending)
{
    if (pending.valid()) {
        const T& value = pending.get();
        if (target.empty()) {
            target = value;
        }
        pending = {};
    }
    return target;
}

} // namespace bb
