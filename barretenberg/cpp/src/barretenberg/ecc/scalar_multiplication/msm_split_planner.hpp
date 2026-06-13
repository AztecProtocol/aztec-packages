#pragma once

// CPU/GPU MSM work-split planner — the in-prover port of bb.js's
// `msm_webgpu/split_planner.ts` (see barretenberg/ts/src/msm_webgpu/
// CPU_GPU_WORKSHARE_PLAN.md §2/§3). Pure arithmetic over a calibrated cost model:
// decide how to split each MSM's points between the native multi-threaded
// Pippenger (cost ∝ non-zeros) and the WebGPU MSM (dense O(n), union-batched) so
// the two engines, run CONCURRENTLY, finish at the same time (minimum makespan).
//
// The model coefficients are measured in JS (`calibration.ts`) and pushed into
// the hook; this header consumes them + per-MSM `nnz`. It is deliberately free of
// curve / threading dependencies so it can be unit-tested in isolation and so the
// `bb_external_batch_msm` hook can call it without pulling new headers.

#include <algorithm>
#include <cmath>
#include <cstddef>
#include <cstdint>
#include <vector>

namespace bb::scalar_multiplication {

/**
 * Calibrated MSM cost models (ms). CPU: `t = cpu_a_per_nnz·nnz + cpu_b_fixed`
 * (native Pippenger, cost ∝ non-zeros). GPU: `t = gpu_a_per_point·n +
 * gpu_b_floor` (dense). `gpu_b_union` is the shared per-batch floor for the union
 * dispatch; when `gpu_b_union_valid` is false the batch planner falls back to
 * `gpu_b_floor`.
 */
struct MsmCostModel {
    double cpu_a_per_nnz = 0.0;
    double cpu_b_fixed = 0.0;
    double gpu_a_per_point = 0.0;
    double gpu_b_floor = 0.0;
    double gpu_b_union = 0.0;
    bool gpu_b_union_valid = false;

    [[nodiscard]] double gpu_floor_batch() const noexcept
    {
        return gpu_b_union_valid ? gpu_b_union : gpu_b_floor;
    }
    [[nodiscard]] double cpu_time(uint64_t nnz) const noexcept
    {
        return (cpu_a_per_nnz * static_cast<double>(nnz)) + cpu_b_fixed;
    }
    [[nodiscard]] double gpu_time_solo(uint64_t n) const noexcept
    {
        return (gpu_a_per_point * static_cast<double>(n)) + gpu_b_floor;
    }
};

/** One MSM to plan. `nnz` is the non-zero scalar count (density signal); pass `n`
 *  when unknown (treats it as dense — conservative, biases toward the GPU). */
struct MsmJob {
    uint64_t n = 0;
    uint64_t nnz = 0;
};

/** Per-MSM split decision. `n_gpu + n_cpu == n`. Either may be 0 (whole engine). */
struct JobPlan {
    size_t index = 0;
    uint64_t n = 0;
    uint64_t n_gpu = 0;
    uint64_t n_cpu = 0;
};

/** Batch plan: per-job splits + the predicted concurrent makespan. */
struct BatchPlan {
    std::vector<JobPlan> jobs;
    double cpu_time_ms = 0.0;
    double gpu_time_ms = 0.0;
    double makespan_ms = 0.0;
    uint64_t gpu_point_total = 0;
    // Index of the one MSM that was fractionally split, or -1.
    int64_t split_job_index = -1;
};

struct PlanOptions {
    // Don't dispatch a GPU slice smaller than this (avoids the floor for a trivial slice).
    uint64_t min_gpu_slice = 1024;
    // Don't keep a CPU slice smaller than this when splitting.
    uint64_t min_cpu_slice = 256;
    // Only split/route to GPU if it beats the better single engine by this fraction.
    double margin = 0.02;
};

namespace detail {
inline uint64_t clamp_u64(int64_t v, uint64_t hi) noexcept
{
    if (v < 0) {
        return 0;
    }
    return std::min(static_cast<uint64_t>(v), hi);
}
// GPU-side time for `points` on the union, 0 when nothing is on the GPU.
inline double gpu_batch_time(double gpu_floor, double a_gpu, uint64_t points, bool any) noexcept
{
    return any ? gpu_floor + (a_gpu * static_cast<double>(points)) : 0.0;
}
} // namespace detail

/**
 * Plan a single `commit` (CPU_GPU_WORKSHARE_PLAN.md §2). Splits one MSM across
 * CPU and GPU at the makespan-balance point, or whole-on-one-engine when
 * splitting doesn't help. Uses the SOLO GPU floor (`gpu_b_floor`).
 */
inline JobPlan plan_single_split(const MsmJob& job, const MsmCostModel& model, const PlanOptions& opt = {})
{
    const uint64_t n = job.n;
    if (n == 0) {
        return JobPlan{ 0, n, 0, 0 };
    }
    const double rho = static_cast<double>(job.nnz) / static_cast<double>(n);
    const double a_cpu_eff = model.cpu_a_per_nnz * rho; // CPU ms per POINT at this density
    const double a_gpu = model.gpu_a_per_point;

    const double t_cpu = model.cpu_time(job.nnz);
    const double t_gpu = model.gpu_time_solo(n);

    // Balance: a_cpu_eff·n_cpu + b_fixed = a_gpu·n_gpu + b_floor, n_cpu + n_gpu = n
    //   ⇒ n_gpu = (a_cpu_eff·n + b_fixed − b_floor) / (a_gpu + a_cpu_eff).
    const double denom = a_cpu_eff + a_gpu;
    uint64_t n_gpu = 0;
    if (denom > 0.0) {
        const double raw =
            ((a_cpu_eff * static_cast<double>(n)) + model.cpu_b_fixed - model.gpu_b_floor) / denom;
        n_gpu = detail::clamp_u64(std::llround(raw), n);
    }
    const uint64_t n_cpu = n - n_gpu;

    if (n_gpu >= opt.min_gpu_slice && n_cpu >= opt.min_cpu_slice) {
        const double cpu_side = (a_cpu_eff * static_cast<double>(n_cpu)) + model.cpu_b_fixed;
        const double gpu_side = (a_gpu * static_cast<double>(n_gpu)) + model.gpu_b_floor;
        const double makespan = std::max(cpu_side, gpu_side);
        if (makespan < std::min(t_cpu, t_gpu) * (1.0 - opt.margin)) {
            return JobPlan{ 0, n, n_gpu, n_cpu };
        }
    }
    return t_gpu < t_cpu ? JobPlan{ 0, n, n, 0 } : JobPlan{ 0, n, 0, n };
}

/**
 * Plan a `batch_commit` (CPU_GPU_WORKSHARE_PLAN.md §3): marginal-benefit greedy
 * (sort by Δ = cpu − gpu_marginal, move GPU-favourable MSMs while it lowers the
 * makespan) + a single fractional split of the boundary MSM to equalise the two
 * engines. Uses the SHARED union floor (`gpu_floor_batch()`).
 */
inline BatchPlan plan_batch(const std::vector<MsmJob>& jobs, const MsmCostModel& model, const PlanOptions& opt = {})
{
    const double gpu_floor = model.gpu_floor_batch();
    const double a_gpu = model.gpu_a_per_point;

    struct Item {
        size_t index;
        uint64_t n;
        uint64_t nnz;
        double cpu;
        double gpu_marg;
        double delta;
    };
    std::vector<Item> items;
    items.reserve(jobs.size());
    for (size_t i = 0; i < jobs.size(); ++i) {
        const double cpu = model.cpu_time(jobs[i].nnz);
        const double gpu_marg = a_gpu * static_cast<double>(jobs[i].n);
        items.push_back({ i, jobs[i].n, jobs[i].nnz, cpu, gpu_marg, cpu - gpu_marg });
    }

    std::vector<bool> on_gpu(jobs.size(), false);
    double cpu_time_ms = 0.0;
    for (const auto& it : items) {
        if (it.n > 0) {
            cpu_time_ms += it.cpu;
        }
    }
    uint64_t gpu_points = 0;

    // Δ-descending order (index asc tiebreak ⇒ deterministic, matching the TS
    // stable sort); n=0 jobs never route.
    std::vector<const Item*> order;
    for (const auto& it : items) {
        if (it.n > 0) {
            order.push_back(&it);
        }
    }
    std::ranges::sort(order, [](const Item* a, const Item* b) {
        if (a->delta != b->delta) {
            return a->delta > b->delta;
        }
        return a->index < b->index;
    });

    const Item* boundary = nullptr;
    for (const Item* it : order) {
        if (it->delta <= 0.0) {
            break; // remaining jobs are GPU-unfavourable
        }
        const double cur_makespan = std::max(cpu_time_ms, detail::gpu_batch_time(gpu_floor, a_gpu, gpu_points, gpu_points > 0));
        const double cpu_after = cpu_time_ms - it->cpu;
        const double gpu_after = gpu_floor + (a_gpu * static_cast<double>(gpu_points + it->n));
        if (std::max(cpu_after, gpu_after) < cur_makespan) {
            on_gpu[it->index] = true;
            cpu_time_ms = cpu_after;
            gpu_points += it->n;
        } else {
            boundary = it; // moving the WHOLE job overshoots → split it
            break;
        }
    }

    BatchPlan plan;
    plan.jobs.reserve(jobs.size());
    for (const auto& it : items) {
        plan.jobs.push_back(JobPlan{ it.index, it.n, on_gpu[it.index] ? it.n : 0, on_gpu[it.index] ? 0 : it.n });
    }

    if (boundary != nullptr && boundary->n >= opt.min_gpu_slice + opt.min_cpu_slice) {
        // The union dispatch (and its floor) exists once the split slice lands.
        const double g_base = gpu_points > 0 ? gpu_floor + (a_gpu * static_cast<double>(gpu_points)) : gpu_floor;
        // f = (C − G_base) / (a_gpu·n_j + a_cpu·nnz_j).
        const double denom = (a_gpu * static_cast<double>(boundary->n)) +
                             (model.cpu_a_per_nnz * static_cast<double>(boundary->nnz));
        double f = denom > 0.0 ? (cpu_time_ms - g_base) / denom : 0.0;
        f = std::clamp(f, 0.0, 1.0);
        const uint64_t n_gpu = static_cast<uint64_t>(std::llround(f * static_cast<double>(boundary->n)));
        if (n_gpu >= opt.min_gpu_slice && boundary->n - n_gpu >= opt.min_cpu_slice) {
            const uint64_t n_cpu = boundary->n - n_gpu;
            plan.jobs[boundary->index] = JobPlan{ boundary->index, boundary->n, n_gpu, n_cpu };
            const double cpu_slice = (model.cpu_a_per_nnz * static_cast<double>(boundary->nnz) *
                                      (static_cast<double>(n_cpu) / static_cast<double>(boundary->n))) +
                                     model.cpu_b_fixed;
            cpu_time_ms = cpu_time_ms - boundary->cpu + cpu_slice;
            gpu_points += n_gpu;
            plan.split_job_index = static_cast<int64_t>(boundary->index);
        }
    }

    bool any_gpu = false;
    for (const auto& p : plan.jobs) {
        if (p.n_gpu > 0) {
            any_gpu = true;
            break;
        }
    }
    plan.cpu_time_ms = cpu_time_ms;
    plan.gpu_time_ms = detail::gpu_batch_time(gpu_floor, a_gpu, gpu_points, any_gpu);
    plan.makespan_ms = std::max(plan.cpu_time_ms, plan.gpu_time_ms);
    plan.gpu_point_total = gpu_points;
    return plan;
}

} // namespace bb::scalar_multiplication
