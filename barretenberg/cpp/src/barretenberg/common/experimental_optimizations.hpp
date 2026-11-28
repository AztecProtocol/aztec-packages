#pragma once

namespace bb {
namespace detail {

extern bool experimental_optimizations_enabled;

} // namespace detail

/** Read and cache BB_EXPERIMENTAL_OPTIMIZATIONS before starting BB work or worker threads. */
void initialize_experimental_optimizations();

/** Return whether experimental optimizations are enabled. Call after initialization. */
inline bool experimental_optimizations_enabled() noexcept
{
    return detail::experimental_optimizations_enabled;
}

} // namespace bb
