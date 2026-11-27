#pragma once

#include <atomic>
#include <cstddef>

namespace bb::scalar_multiplication {

inline constexpr size_t DEFAULT_MSM_BATCH_MEM_BUDGET = size_t{ 32 } << 20;

namespace detail {
// NOLINTNEXTLINE(cppcoreguidelines-avoid-non-const-global-variables)
inline std::atomic<size_t> msm_batch_mem_budget{ DEFAULT_MSM_BATCH_MEM_BUDGET };
} // namespace detail

/**
 * @brief Bytes of scratch one MSM_fast arena may use for the windows it processes together.
 * @details The arena holds a fixed part (per-scalar and per-worker state) plus as many windows' schedules and buckets
 * as fit in this budget, with at least one window per batch, so a smaller budget means more passes over the
 * scalars. An MSM reads the budget more than once (to size its arena and again to choose windows per batch), so it
 * must not change while an MSM runs; set it before proving.
 */
inline size_t get_msm_batch_mem_budget() noexcept
{
    return detail::msm_batch_mem_budget.load(std::memory_order_relaxed);
}

inline void set_msm_batch_mem_budget(size_t bytes) noexcept
{
    detail::msm_batch_mem_budget.store(bytes, std::memory_order_relaxed);
}

} // namespace bb::scalar_multiplication
