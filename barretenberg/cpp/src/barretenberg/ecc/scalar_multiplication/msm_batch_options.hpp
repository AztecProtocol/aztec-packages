#pragma once

#include <algorithm>
#include <cstddef>
#include <limits>

namespace bb::scalar_multiplication {

/** @brief Per-call workspace policy for batches of independent MSMs. */
struct MsmBatchOptions {
    bool large_workspace = false;

    /**
     * @brief Limit workers by available work and aggregate arena space, allowing at least one arena when work exists.
     * Native large-workspace batches target 2 GiB; other batches target 32 MiB. This is not a process memory limit.
     */
    constexpr size_t num_workers(size_t pool_width, size_t num_msms, size_t arena_bytes) const noexcept
    {
#ifdef __wasm__
        constexpr size_t budget_bytes = 32ULL * 1024ULL * 1024ULL;
#else
        const size_t budget_bytes = large_workspace ? 2ULL * 1024ULL * 1024ULL * 1024ULL : 32ULL * 1024ULL * 1024ULL;
#endif
        const size_t workers_by_budget =
            arena_bytes > 0 ? std::max<size_t>(1, budget_bytes / arena_bytes) : std::numeric_limits<size_t>::max();
        return std::min({ pool_width, num_msms, workers_by_budget });
    }
};

} // namespace bb::scalar_multiplication
