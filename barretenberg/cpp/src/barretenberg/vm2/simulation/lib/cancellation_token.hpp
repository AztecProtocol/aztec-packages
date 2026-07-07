#pragma once

#include <atomic>
#include <memory>
#include <stdexcept>

namespace bb::avm2::simulation {

/**
 * @brief Exception thrown when simulation is cancelled.
 */
class CancelledException : public std::runtime_error {
  public:
    CancelledException()
        : std::runtime_error("Simulation cancelled")
    {}
};

/**
 * @brief A thread-safe cancellation token for C++ AVM simulation.
 *
 * This token is used to signal cancellation from TypeScript to C++ when a simulation
 * times out. The token is created in TypeScript, passed through NAPI, and checked
 * periodically during C++ execution.
 *
 * Usage:
 * - TypeScript creates the token and passes it to avmSimulate
 * - C++ checks is_cancelled() in the execution loop
 * - On timeout, TypeScript calls cancel()
 * - C++ throws CancelledException when it observes cancellation
 *
 * Thread safety:
 * - cancel() is called from the TypeScript/main thread
 * - is_cancelled()/check() are called from the libuv worker thread
 * - std::atomic ensures visibility between threads
 */
class CancellationToken {
  public:
    CancellationToken()
        : cancelled_(false)
    {}

    // Non-copyable, non-movable
    CancellationToken(const CancellationToken&) = delete;
    CancellationToken& operator=(const CancellationToken&) = delete;
    CancellationToken(CancellationToken&&) = delete;
    CancellationToken& operator=(CancellationToken&&) = delete;

    /**
     * @brief Signal cancellation. Called from TypeScript thread.
     *
     * This is thread-safe and can be called while C++ simulation is running.
     */
    void cancel() { cancelled_.store(true, std::memory_order_release); }

    /**
     * @brief Clear a prior cancellation so the token can be reused. Called from the
     * simulation thread before starting a new simulation. Lets a single
     * process-lifetime token back successive simulations without reallocation.
     */
    void reset() { cancelled_.store(false, std::memory_order_release); }

    /**
     * @brief Check if cancellation has been signaled. Called from C++ simulation thread.
     *
     * @return true if cancel() has been called
     */
    bool is_cancelled() const { return cancelled_.load(std::memory_order_acquire); }

    /**
     * @brief Check and throw if cancelled. Called from C++ simulation thread.
     *
     * @throws CancelledException if cancel() has been called
     */
    void check_and_throw() const
    {
        if (is_cancelled()) {
            throw CancelledException();
        }
    }

  private:
    std::atomic<bool> cancelled_;
};

using CancellationTokenPtr = std::shared_ptr<CancellationToken>;

} // namespace bb::avm2::simulation
