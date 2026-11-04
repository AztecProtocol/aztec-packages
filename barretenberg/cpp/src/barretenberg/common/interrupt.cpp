#include "barretenberg/common/interrupt.hpp"

#include <atomic>
#include <exception>

namespace bb {

namespace {

// A signal handler may only touch lock-free atomics, and a wasm host writes the word with Atomics on the shared
// memory, which needs a naturally aligned 32-bit integer.
static_assert(std::atomic<uint32_t>::is_always_lock_free);
static_assert(sizeof(std::atomic<uint32_t>) == sizeof(uint32_t));

// NOLINTBEGIN(cppcoreguidelines-avoid-non-const-global-variables)
std::atomic<uint32_t> interrupt_requested{ 0 };
std::atomic<detail::InterruptObserver> interrupt_observer{ nullptr };
thread_local int armed_depth = 0;
thread_local int parallel_region_depth = 0;
// NOLINTEND(cppcoreguidelines-avoid-non-const-global-variables)

} // namespace

void InterruptFlag::request() noexcept
{
    interrupt_requested.store(1, std::memory_order_relaxed);
}

bool InterruptFlag::clear() noexcept
{
    return interrupt_requested.exchange(0, std::memory_order_relaxed) != 0;
}

void* InterruptFlag::address() noexcept
{
    return &interrupt_requested;
}

InterruptScope::InterruptScope() noexcept
{
    ++armed_depth;
}

InterruptScope::~InterruptScope()
{
    --armed_depth;
}

void interrupt_point(const char* site)
{
    if (armed_depth == 0 || parallel_region_depth != 0) {
        return;
    }
    if (const auto observer = interrupt_observer.load(std::memory_order_relaxed)) {
        observer(site);
    }
#ifndef BB_NO_EXCEPTIONS
    if (interrupt_requested.load(std::memory_order_relaxed) != 0 && std::uncaught_exceptions() == 0) {
        throw InterruptedException();
    }
#endif
}

namespace detail {

ParallelRegion::ParallelRegion() noexcept
{
    ++parallel_region_depth;
}

ParallelRegion::~ParallelRegion()
{
    --parallel_region_depth;
}

void set_interrupt_observer(InterruptObserver observer) noexcept
{
    interrupt_observer.store(observer, std::memory_order_relaxed);
}

} // namespace detail

} // namespace bb
