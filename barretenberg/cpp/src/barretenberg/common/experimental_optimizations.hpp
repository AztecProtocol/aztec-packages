#pragma once

namespace bb {
namespace detail {

extern bool experimental_optimizations_enabled;

} // namespace detail

/** Read and freeze the process environment before starting BB work or worker threads. */
void initialize_experimental_optimizations();

/** Return the frozen BB optimisation selection after initialization. */
inline bool experimental_optimizations_enabled() noexcept
{
    return detail::experimental_optimizations_enabled;
}

} // namespace bb
