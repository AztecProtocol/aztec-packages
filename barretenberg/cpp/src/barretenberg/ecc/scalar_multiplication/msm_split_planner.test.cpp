// Unit tests for the CPU/GPU work-split planner — the C++ port of bb.js's
// split_planner.test.ts. Pure arithmetic, no GPU. The cost model is the one fit
// to msm-cpu-vs-gpu.csv on M4, so the numbers double as a cross-language
// regression against the TypeScript reference.
#include "msm_split_planner.hpp"

#include <cstdint>
#include <vector>

#include <gtest/gtest.h>

namespace {

using bb::scalar_multiplication::BatchPlan;
using bb::scalar_multiplication::JobPlan;
using bb::scalar_multiplication::MsmCostModel;
using bb::scalar_multiplication::MsmJob;
using bb::scalar_multiplication::plan_batch;
using bb::scalar_multiplication::plan_single_split;

// A_cpu ≈ 1.0 µs/non-zero, A_gpu ≈ 0.35 µs/point, solo floor 8 ms, union floor 2 ms.
MsmCostModel m4()
{
    return MsmCostModel{
        .cpu_a_per_nnz = 1.0e-3,
        .cpu_b_fixed = 0.3,
        .gpu_a_per_point = 3.5e-4,
        .gpu_b_floor = 8.0,
        .gpu_b_union = 2.0,
        .gpu_b_union_valid = true,
    };
}

double all_cpu_ms(const MsmCostModel& m, const std::vector<MsmJob>& jobs)
{
    double s = 0.0;
    for (const auto& j : jobs) {
        if (j.n > 0) {
            s += m.cpu_time(j.nnz);
        }
    }
    return s;
}

double all_gpu_ms(const MsmCostModel& m, const std::vector<MsmJob>& jobs)
{
    uint64_t total = 0;
    for (const auto& j : jobs) {
        total += j.n;
    }
    return total > 0 ? m.gpu_floor_batch() + (m.gpu_a_per_point * static_cast<double>(total)) : 0.0;
}

// ── plan_single_split (§2) ──────────────────────────────────────────────────

TEST(MsmSplitPlanner, SparseLargeStaysOnCpu)
{
    // n=131071 but only ~131 non-zeros: CPU ≈ 0.4 ms, GPU floor alone is 8 ms.
    const JobPlan p = plan_single_split({ .n = 131071, .nnz = 131 }, m4());
    EXPECT_EQ(p.n_gpu, 0U);
    EXPECT_EQ(p.n_cpu, 131071U);
}

TEST(MsmSplitPlanner, TinyStaysOnCpu)
{
    const JobPlan p = plan_single_split({ .n = 512, .nnz = 512 }, m4());
    EXPECT_EQ(p.n_gpu, 0U);
}

TEST(MsmSplitPlanner, DenseLargeSplitsAndBalances)
{
    const uint64_t n = 131071;
    const MsmCostModel m = m4();
    const JobPlan p = plan_single_split({ .n = n, .nnz = n }, m);
    EXPECT_GT(p.n_gpu, 0U);
    EXPECT_GT(p.n_cpu, 0U);
    EXPECT_EQ(p.n_gpu + p.n_cpu, n);
    const double frac = static_cast<double>(p.n_gpu) / static_cast<double>(n);
    EXPECT_GT(frac, 0.6); // GPU is ~2.9× faster per element here
    EXPECT_LT(frac, 0.8);
    const double cpu_side = (m.cpu_a_per_nnz * static_cast<double>(p.n_cpu)) + m.cpu_b_fixed;
    const double gpu_side = (m.gpu_a_per_point * static_cast<double>(p.n_gpu)) + m.gpu_b_floor;
    EXPECT_LT(std::abs(cpu_side - gpu_side), 0.5); // balanced
    const double makespan = std::max(cpu_side, gpu_side);
    EXPECT_LT(makespan, m.gpu_time_solo(n)); // beats GPU-only
    EXPECT_LT(makespan, m.cpu_time(n));      // beats CPU-only
    EXPECT_GT(makespan, 35.0);
    EXPECT_LT(makespan, 45.0);
}

TEST(MsmSplitPlanner, SingleNeverWorseThanBetterEngine)
{
    const MsmCostModel m = m4();
    for (uint64_t n : { 1U << 12, 1U << 14, 1U << 15, 1U << 16, 1U << 17 }) {
        for (double density : { 0.05, 0.25, 1.0 }) {
            const auto nnz = static_cast<uint64_t>(std::max(1.0, std::round(static_cast<double>(n) * density)));
            const JobPlan p = plan_single_split({ .n = n, .nnz = nnz }, m);
            EXPECT_EQ(p.n_gpu + p.n_cpu, n);
            const double cpu_side =
                p.n_cpu > 0
                    ? (m.cpu_a_per_nnz * (static_cast<double>(nnz) * (static_cast<double>(p.n_cpu) / static_cast<double>(n)))) +
                          m.cpu_b_fixed
                    : 0.0;
            const double gpu_side = p.n_gpu > 0 ? (m.gpu_a_per_point * static_cast<double>(p.n_gpu)) + m.gpu_b_floor : 0.0;
            const double makespan = std::max(cpu_side, gpu_side);
            EXPECT_LE(makespan, std::min(m.cpu_time(nnz), m.gpu_time_solo(n)) + 1e-6);
        }
    }
}

// ── plan_batch (§3) ─────────────────────────────────────────────────────────

TEST(MsmSplitPlanner, EmptyBatch)
{
    const BatchPlan p = plan_batch({}, m4());
    EXPECT_DOUBLE_EQ(p.makespan_ms, 0.0);
    EXPECT_EQ(p.gpu_point_total, 0U);
}

TEST(MsmSplitPlanner, AllSparseStaysOnCpu)
{
    std::vector<MsmJob> jobs(20, MsmJob{ .n = 131071, .nnz = 50 });
    const BatchPlan p = plan_batch(jobs, m4());
    EXPECT_EQ(p.gpu_point_total, 0U);
    EXPECT_EQ(p.split_job_index, -1);
    for (const auto& j : p.jobs) {
        EXPECT_EQ(j.n_gpu, 0U);
    }
}

TEST(MsmSplitPlanner, UniformDenseBalancesBelowBothPureStrategies)
{
    std::vector<MsmJob> jobs(40, MsmJob{ .n = 1U << 16, .nnz = 1U << 16 });
    const MsmCostModel m = m4();
    const BatchPlan p = plan_batch(jobs, m);
    EXPECT_GT(p.gpu_point_total, 0U);
    EXPECT_LT(p.makespan_ms, all_cpu_ms(m, jobs));
    EXPECT_LT(p.makespan_ms, all_gpu_ms(m, jobs));
    EXPECT_LT(std::abs(p.cpu_time_ms - p.gpu_time_ms), (0.05 * p.makespan_ms) + 1.0); // balanced
    for (const auto& j : p.jobs) {
        EXPECT_EQ(j.n_gpu + j.n_cpu, j.n);
    }
}

TEST(MsmSplitPlanner, MixedBatchRoutesDenseToGpuSparseToCpu)
{
    std::vector<MsmJob> jobs = {
        { .n = 88899, .nnz = 88899 }, { .n = 88899, .nnz = 88899 }, { .n = 88899, .nnz = 88899 },
        { .n = 131071, .nnz = 131071 },
    };
    for (int i = 0; i < 12; ++i) {
        jobs.push_back({ .n = 131071, .nnz = 40 }); // sparse range-constraint
    }
    for (int i = 0; i < 30; ++i) {
        jobs.push_back({ .n = 4, .nnz = 4 }); // tiny calldata
    }
    const MsmCostModel m = m4();
    const BatchPlan p = plan_batch(jobs, m);
    EXPECT_GT(p.gpu_point_total, 0U);
    for (const auto& jp : p.jobs) {
        const MsmJob& src = jobs[jp.index];
        if (src.n <= 4 || (src.n > 1000 && src.nnz < 100)) {
            EXPECT_EQ(jp.n_gpu, 0U); // sparse/tiny on CPU
        }
    }
    bool any_dense_on_gpu = false;
    for (int i = 0; i < 4; ++i) {
        any_dense_on_gpu = any_dense_on_gpu || p.jobs[static_cast<size_t>(i)].n_gpu > 0;
    }
    EXPECT_TRUE(any_dense_on_gpu);
    EXPECT_LT(p.makespan_ms, all_cpu_ms(m, jobs));
}

TEST(MsmSplitPlanner, MakespanNeverWorseThanPureStrategiesAcrossRandomBatches)
{
    const MsmCostModel m = m4();
    uint64_t s = 12345; // simple LCG
    auto rnd = [&s]() {
        s = (s * 6364136223846793005ULL) + 1442695040888963407ULL;
        return static_cast<double>(s >> 11) / static_cast<double>(1ULL << 53);
    };
    for (int trial = 0; trial < 50; ++trial) {
        const int k = 1 + static_cast<int>(rnd() * 30);
        std::vector<MsmJob> jobs;
        jobs.reserve(static_cast<size_t>(k));
        for (int i = 0; i < k; ++i) {
            const uint64_t n = 1ULL << (8 + static_cast<int>(rnd() * 10)); // 2^8..2^17
            const auto nnz = std::max<uint64_t>(1, static_cast<uint64_t>(std::round(static_cast<double>(n) * rnd())));
            jobs.push_back({ .n = n, .nnz = nnz });
        }
        const BatchPlan p = plan_batch(jobs, m);
        for (const auto& jp : p.jobs) {
            EXPECT_EQ(jp.n_gpu + jp.n_cpu, jp.n);
        }
        EXPECT_LE(p.makespan_ms, all_cpu_ms(m, jobs) + 1e-6);
        EXPECT_LE(p.makespan_ms, all_gpu_ms(m, jobs) + 1e-6);
    }
}

TEST(MsmSplitPlanner, BoundarySplitBalancesWhenItFires)
{
    // One big dense MSM dwarfs a little CPU pile: must split it to balance.
    std::vector<MsmJob> jobs = { { .n = 1U << 17, .nnz = 1U << 17 }, { .n = 4096, .nnz = 4096 } };
    const MsmCostModel m = m4();
    const BatchPlan p = plan_batch(jobs, m);
    if (p.split_job_index != -1) {
        EXPECT_LT(std::abs(p.cpu_time_ms - p.gpu_time_ms), (0.05 * p.makespan_ms) + 1.0);
    }
    EXPECT_LT(p.makespan_ms, all_cpu_ms(m, jobs));
}

TEST(MsmSplitPlanner, Deterministic)
{
    std::vector<MsmJob> jobs = {
        { .n = 1U << 16, .nnz = 1U << 16 },
        { .n = 1U << 15, .nnz = 1U << 14 },
        { .n = 1U << 17, .nnz = 1U << 17 },
    };
    const MsmCostModel m = m4();
    const BatchPlan a = plan_batch(jobs, m);
    const BatchPlan b = plan_batch(jobs, m);
    ASSERT_EQ(a.jobs.size(), b.jobs.size());
    for (size_t i = 0; i < a.jobs.size(); ++i) {
        EXPECT_EQ(a.jobs[i].n_gpu, b.jobs[i].n_gpu);
        EXPECT_EQ(a.jobs[i].n_cpu, b.jobs[i].n_cpu);
    }
    EXPECT_EQ(a.split_job_index, b.split_job_index);
    EXPECT_DOUBLE_EQ(a.makespan_ms, b.makespan_ms);
}

} // namespace
