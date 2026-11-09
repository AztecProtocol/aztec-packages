#pragma once

namespace bb {
namespace detail {

extern bool experimental_optimizations_enabled;
extern bool rollup_experimental_optimizations_enabled;
extern bool avm_experimental_optimizations_enabled;

} // namespace detail

/** Read and cache BB_EXPERIMENTAL_OPTIMIZATIONS before starting BB work or worker threads. */
void initialize_experimental_optimizations();

/** Return whether experimental optimizations are enabled. Call after initialization. */
inline bool experimental_optimizations_enabled() noexcept
{
    return detail::experimental_optimizations_enabled;
}

/** Return whether experimental rollup construction and IPA optimizations are enabled. Call after initialization. */
inline bool rollup_experimental_optimizations_enabled() noexcept
{
    return detail::rollup_experimental_optimizations_enabled;
}

/** Return the frozen AVM first-fold and PCS optimisation selection after initialization. */
inline bool avm_experimental_optimizations_enabled() noexcept
{
    return detail::avm_experimental_optimizations_enabled;
}

} // namespace bb
