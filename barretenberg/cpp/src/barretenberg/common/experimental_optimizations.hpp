#pragma once

namespace bb {
namespace detail {

extern bool experimental_optimizations_enabled;
extern bool rollup_experimental_optimizations_enabled;
extern bool avm_experimental_optimizations_enabled;

} // namespace detail

/** How initialize_experimental_optimizations() chooses the settings it freezes. */
enum class ExperimentalOptimizationsMode {
    /** Read the three *_EXPERIMENTAL_OPTIMIZATIONS environment variables. */
    FromEnvironment,
    /** Freeze every setting as disabled. For processes whose only job is to derive a verification key or verify. */
    ForceDisabled,
};

/**
 * Freeze the experimental optimization settings before starting BB work or worker threads. Only the first call has
 * an effect. A later ForceDisabled call fails if the settings were already frozen with any of them enabled.
 */
void initialize_experimental_optimizations(
    ExperimentalOptimizationsMode mode = ExperimentalOptimizationsMode::FromEnvironment);

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

/** Return the frozen AVM optimisation selection after initialization. */
inline bool avm_experimental_optimizations_enabled() noexcept
{
    return detail::avm_experimental_optimizations_enabled;
}

/**
 * Return whether an optimization that can change circuit construction or verification key commitments is enabled.
 * The AVM flag only affects the AVM prover, whose verification key is fixed in source.
 */
inline bool vk_affecting_experimental_optimizations_enabled() noexcept
{
    return detail::experimental_optimizations_enabled || detail::rollup_experimental_optimizations_enabled;
}

/**
 * Fail unless verification keys can be derived in this process. A key derived with experimental optimizations
 * enabled would make any defect in them part of what verifiers accept, so keys are only derived by the existing
 * implementations.
 */
void require_vk_derivation_allowed(const char* operation);

} // namespace bb
