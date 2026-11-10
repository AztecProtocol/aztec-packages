#pragma once
/**
 * @file interrupt.hpp
 * @brief Cooperative interruption of a running command.
 *
 * A host asks bb to stop by setting one process-wide flag: a native server's SIGURG handler sets it, and a wasm host
 * stores to the word at bb_ipc_ffi_interrupt_flag() through the module's shared memory. The flag is read only at
 * explicit interrupt_point() calls, and only on a thread that holds an InterruptScope, so unarmed work never observes
 * it. It stays set until InterruptFlag::clear(): every armed command fails at its first point until the host clears
 * it, which is how commands already queued behind an interrupted one fail without doing work.
 */
#include <cstdint>
#include <stdexcept>

namespace bb {

/** The what() of every InterruptedException; clients recognise an interruption by this text. */
inline constexpr const char INTERRUPTED_MESSAGE[] = "bb: interrupted";

class InterruptedException : public std::runtime_error {
  public:
    InterruptedException()
        : std::runtime_error(INTERRUPTED_MESSAGE)
    {}
};

class InterruptFlag {
  public:
    /** Sets the flag. Async-signal-safe: a single lock-free atomic store. */
    static void request() noexcept;
    /** Clears the flag and returns whether it was set. */
    static bool clear() noexcept;
    /** The flag's naturally aligned 32-bit word, for a host that sets it through shared memory. Stable for the life
     *  of the process. */
    static void* address() noexcept;
};

/** Arms interrupt_point() on the constructing thread until destroyed. Scopes nest. */
class InterruptScope {
  public:
    InterruptScope() noexcept;
    ~InterruptScope();
    InterruptScope(const InterruptScope&) = delete;
    InterruptScope(InterruptScope&&) = delete;
    InterruptScope& operator=(const InterruptScope&) = delete;
    InterruptScope& operator=(InterruptScope&&) = delete;
};

/**
 * @brief Throws InterruptedException if the flag is set and this point may unwind.
 * @details A no-op unless the calling thread holds an InterruptScope, is outside every parallel_for region, and is
 * not already unwinding. A throw out of a parallel_for task would leave the pool waiting for that task, and a throw
 * from a destructor during unwinding terminates. Never throws in builds without exceptions.
 * @param site A string literal "<stage>:<name>" naming the call site, reported to the observer.
 */
void interrupt_point(const char* site);

namespace detail {

/** Marks a parallel_for region on this thread for its lifetime; interrupt_point() is a no-op inside one. */
struct ParallelRegion {
    ParallelRegion() noexcept;
    ~ParallelRegion();
    ParallelRegion(const ParallelRegion&) = delete;
    ParallelRegion(ParallelRegion&&) = delete;
    ParallelRegion& operator=(const ParallelRegion&) = delete;
    ParallelRegion& operator=(ParallelRegion&&) = delete;
};

using InterruptObserver = void (*)(const char* site);
/** Tests and measurement only: `observer` runs at every armed interrupt_point(), before the flag is read. */
void set_interrupt_observer(InterruptObserver observer) noexcept;

} // namespace detail

} // namespace bb
