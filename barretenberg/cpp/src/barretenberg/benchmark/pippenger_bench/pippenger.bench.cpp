/**
 * @brief Pippenger MSM benchmarks
 *
 * Single MSM (pippenger_unsafe) and batch MSM (batch_multi_scalar_mul).
 * Batch config modeled after AVM: ~2618 wire polys of size 2^21, committed in batches of 32.
 */
#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/polynomials/polynomial_arithmetic.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <benchmark/benchmark.h>

#include "barretenberg/common/google_bb_bench.hpp"

#include <cstdint>
#include <limits>
#include <vector>

using namespace benchmark;

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;

namespace {

class PippengerBench : public benchmark::Fixture {
  public:
    static constexpr size_t MAX_POINTS = 1 << 22;
    std::shared_ptr<bb::srs::factories::Crs<Curve>> srs;
    std::vector<Fr> scalars;
    bb::numeric::RNG& engine = bb::numeric::get_debug_randomness();

    void SetUp([[maybe_unused]] const ::benchmark::State& state) override
    {
        bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
        srs = bb::srs::get_crs_factory<Curve>()->get_crs(MAX_POINTS);

        scalars.resize(MAX_POINTS);
        for (auto& x : scalars) {
            x = Fr::random_element(&engine);
        }
    }
};

// ===================== Single MSM =====================

BENCHMARK_DEFINE_F(PippengerBench, PippengerUnsafe)(benchmark::State& state)
{
    const size_t num_points = static_cast<size_t>(state.range(0));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_unsafe<Curve>(poly_scalars, points);
    }
}

// ===== Round-parallel MSM (A) — window-partitioned, independent of pippenger_unsafe =====

BENCHMARK_DEFINE_F(PippengerBench, PippengerRoundParallel)(benchmark::State& state)
{
    const size_t num_threads = static_cast<size_t>(state.range(0));
    const size_t num_points = static_cast<size_t>(state.range(1));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_round_parallel<Curve>(poly_scalars, points);
    }

    bb::set_parallel_for_concurrency(original_concurrency);
}

BENCHMARK_DEFINE_F(PippengerBench, PippengerUnsafeThreads)(benchmark::State& state)
{
    const size_t num_threads = static_cast<size_t>(state.range(0));
    const size_t num_points = static_cast<size_t>(state.range(1));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_unsafe<Curve>(poly_scalars, points);
    }

    bb::set_parallel_for_concurrency(original_concurrency);
}

// ===== Per-stage scaling sweep (single MSM, native concurrency) =====
// A single round-parallel MSM at the runtime's native concurrency (bb::get_num_cpus()
// natively; HARDWARE_CONCURRENCY under wasmtime), swept over 2^17..2^21. Unlike
// PippengerRoundParallel this fixes a single thread axis, so the per-stage BB_BENCH
// breakdown is clean. Run with BB_BENCH=1 to dump the Stage1..Stage7 hierarchical timings
// per size; comparing native vs wasmtime per-stage scaling isolates which stage fails to
// scale natively. Under wasm the breakdown requires ENABLE_WASM_BENCH=ON at build time.
BENCHMARK_DEFINE_F(PippengerBench, PippengerRoundParallelScaling)(benchmark::State& state)
{
    const size_t num_points = static_cast<size_t>(state.range(0));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::pippenger_round_parallel<Curve>(poly_scalars, points);
    }
}

// Legacy counterpart of the scaling sweep: byte-identical merge-train MSM
// (legacy::pippenger_unsafe) over the same points/sizes, with the legacy stage markers
// (MSM::build_point_schedule / sort_point_schedule / batch_accumulate_into_buckets /
// accumulate_buckets) so its BB_BENCH breakdown maps onto the rewrite's stages.
BENCHMARK_DEFINE_F(PippengerBench, PippengerScalingLegacy)(benchmark::State& state)
{
    const size_t num_points = static_cast<size_t>(state.range(0));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    std::span<Fr> span(&scalars[0], num_points);
    bb::PolynomialSpan<Fr> poly_scalars(0, span);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::legacy::pippenger_unsafe<Curve>(poly_scalars, points);
    }
}

// ===================== Batch MSM =====================

BENCHMARK_DEFINE_F(PippengerBench, BatchMSM)(benchmark::State& state)
{
    const size_t num_polys = static_cast<size_t>(state.range(0));
    const size_t poly_size = static_cast<size_t>(state.range(1));

    std::vector<std::vector<Fr>> all_scalars(num_polys);
    std::vector<bb::PolynomialSpan<Fr>> scalar_spans;
    std::span<const G1> points = srs->get_monomial_points().subspan(0, poly_size);

    for (size_t i = 0; i < num_polys; ++i) {
        all_scalars[i].resize(poly_size);
        for (auto& s : all_scalars[i]) {
            s = Fr::random_element(&engine);
        }
        scalar_spans.emplace_back(0, std::span<Fr>(all_scalars[i]));
    }

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(points, scalar_spans, false);
    }
}

// ===================== Batched MSM — Chonk-representative workloads =====================
//
// Two paths are benchmarked side-by-side for each scenario:
//   - "Batched" calls MSM::batch_multi_scalar_mul (new multi-MSM Phases 1-6b pipeline).
//   - "PerMsm" calls pippenger_round_parallel(...) once per MSM (the legacy fallback —
//     equivalent to what MSM::batch_multi_scalar_mul did before the multi-MSM dispatcher).
//
// The Batched/PerMsm ratio is the metric of interest: it shows the lift from batching
// the round-parallel scaffolding (GLV doubling, Constantine recoding, schedule build)
// once per batch_commit instead of K times.
//
// Scenarios are picked to mirror the workloads observed in chonk profiles:
//   - TranslatorWires_2_17 / 2_14: K=4 dense BN254, the regression case from the
//     translator-wire batch_commit hot path.
//   - MegaOink_K11: simulates a full Mega oink wire commit (K=11, all same SRS prefix,
//     all dense) — the headline target for batching.
//   - ECCVMSparse_half: K=4 with ~50% zero scalars, the ECCVM-wire pattern that the
//     OLD MSM optimised via non-zero work-unit weighting.
//   - DatabusSparse_mostly0: K=8 short polys (n=16384) with ~75% zero scalars —
//     the databus-inverse pattern.

namespace {
struct BatchScenario {
    const char* name;
    size_t k;            // number of MSMs
    size_t n;            // points per MSM (uniform within each scenario)
    double zero_density; // probability of a scalar being zero (0.0 = dense)
};

std::vector<std::vector<Fr>> build_batch_scalars(
    size_t k, size_t n, double zero_density, bb::numeric::RNG& engine, std::span<const Fr> scalar_pool)
{
    std::vector<std::vector<Fr>> out(k);
    for (size_t m = 0; m < k; ++m) {
        out[m].resize(n);
        for (size_t i = 0; i < n; ++i) {
            const bool zero = zero_density > 0.0 && (static_cast<double>(engine.get_random_uint32() & 0xFFFFFU) /
                                                     static_cast<double>(0x100000U)) < zero_density;
            out[m][i] = zero ? Fr::zero() : scalar_pool[(m * n + i) % scalar_pool.size()];
        }
    }
    return out;
}
} // namespace

BENCHMARK_DEFINE_F(PippengerBench, BatchedChonk)(benchmark::State& state)
{
    const size_t scenario_idx = static_cast<size_t>(state.range(0));
    // Production K + N values, derived from the actual prover call sites that drive
    // `commitment_key.batch_commit` -> `MSM::batch_multi_scalar_mul`:
    //
    //   Translator   K=10 N=2^17 — execute_wire_and_sorted_constraints_commitments_round:
    //                              5 ConcatenatedPolynomials + 5 OrderedRangeConstraints,
    //                              all at full circuit size (MINI_CIRCUIT * CONCAT = 2^13 * 16).
    //                              Dense (no duplicates hint passed).
    //   MegaOink     K=17 N=2^17 — OinkProver::commit_to_wires (Mega):
    //                              3 base wires (w_l/w_r/w_o, duplicates hint=true)
    //                              + 4 ecc_op_wires (sparse, mostly populated only when ecc ops fire)
    //                              + 10 databus polys (5 buses * 2; mostly zero outside the active bus).
    //                              Approximated here as a dense single density; the per-poly
    //                              heterogeneity is left to a follow-up (would need build_batch_scalars
    //                              to accept per-poly densities/hints).
    //   DatabusOnly  K=10 N=2^14 — isolates the databus sub-batch from Mega oink (mostly-zero
    //                              wires at a smaller size — what the datbus-inverse pattern looks like).
    //
    // K=4 sub-batches that existed previously were not representative of any prover; removed.
    static const std::array<BatchScenario, 5> scenarios{ {
        { "Translator_K10_2_17", 10, 1U << 17, 0.0 },
        { "MegaOink_K17_2_17", 17, 1U << 17, 0.0 },
        { "DatabusOnly_K10_2_14_mostly0", 10, 1U << 14, 0.75 },
        // ECCVM 85-wire batch split into its dense and sparse halves. ~60 wires
        // (precompute point-table + msm-region + accumulators + shifted entities)
        // are dense; ~25 transcript wires are populated only up to op-queue size
        // (CONST_OP_QUEUE_LOG_SIZE = 2^12) in a 2^15 dyadic allocation, so ~87.5%
        // zero. Sum of the two scenarios approximates the production ECCVM commit
        // batch. BN254 used as a proxy for Grumpkin: at N=2^15 both curves sit
        // above their native GLV threshold (2^13), so the dispatcher's only
        // cross-MSM amortisation (the shared GLV-doubled prefix) is OFF either
        // way and the batched/per-MSM ratio transfers.
        { "ECCVM_dense_K60_2_15", 60, 1U << 15, 0.0 },
        { "ECCVM_transcript_K25_2_15", 25, 1U << 15, 0.875 },
    } };
    const auto& sc = scenarios[scenario_idx];
    state.SetLabel(sc.name);

    auto all_scalars = build_batch_scalars(sc.k, sc.n, sc.zero_density, engine, scalars);
    std::vector<bb::PolynomialSpan<Fr>> scalar_spans;
    std::span<const G1> points = srs->get_monomial_points().subspan(0, sc.n);
    for (size_t m = 0; m < sc.k; ++m) {
        scalar_spans.emplace_back(0, std::span<Fr>(all_scalars[m]));
    }

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(points, scalar_spans, false);
    }
}

BENCHMARK_DEFINE_F(PippengerBench, PerMsmChonk)(benchmark::State& state)
{
    const size_t scenario_idx = static_cast<size_t>(state.range(0));
    // Production K + N values, derived from the actual prover call sites that drive
    // `commitment_key.batch_commit` -> `MSM::batch_multi_scalar_mul`:
    //
    //   Translator   K=10 N=2^17 — execute_wire_and_sorted_constraints_commitments_round:
    //                              5 ConcatenatedPolynomials + 5 OrderedRangeConstraints,
    //                              all at full circuit size (MINI_CIRCUIT * CONCAT = 2^13 * 16).
    //                              Dense (no duplicates hint passed).
    //   MegaOink     K=17 N=2^17 — OinkProver::commit_to_wires (Mega):
    //                              3 base wires (w_l/w_r/w_o, duplicates hint=true)
    //                              + 4 ecc_op_wires (sparse, mostly populated only when ecc ops fire)
    //                              + 10 databus polys (5 buses * 2; mostly zero outside the active bus).
    //                              Approximated here as a dense single density; the per-poly
    //                              heterogeneity is left to a follow-up (would need build_batch_scalars
    //                              to accept per-poly densities/hints).
    //   DatabusOnly  K=10 N=2^14 — isolates the databus sub-batch from Mega oink (mostly-zero
    //                              wires at a smaller size — what the datbus-inverse pattern looks like).
    //
    // K=4 sub-batches that existed previously were not representative of any prover; removed.
    static const std::array<BatchScenario, 5> scenarios{ {
        { "Translator_K10_2_17", 10, 1U << 17, 0.0 },
        { "MegaOink_K17_2_17", 17, 1U << 17, 0.0 },
        { "DatabusOnly_K10_2_14_mostly0", 10, 1U << 14, 0.75 },
        // ECCVM 85-wire batch split into its dense and sparse halves. ~60 wires
        // (precompute point-table + msm-region + accumulators + shifted entities)
        // are dense; ~25 transcript wires are populated only up to op-queue size
        // (CONST_OP_QUEUE_LOG_SIZE = 2^12) in a 2^15 dyadic allocation, so ~87.5%
        // zero. Sum of the two scenarios approximates the production ECCVM commit
        // batch. BN254 used as a proxy for Grumpkin: at N=2^15 both curves sit
        // above their native GLV threshold (2^13), so the dispatcher's only
        // cross-MSM amortisation (the shared GLV-doubled prefix) is OFF either
        // way and the batched/per-MSM ratio transfers.
        { "ECCVM_dense_K60_2_15", 60, 1U << 15, 0.0 },
        { "ECCVM_transcript_K25_2_15", 25, 1U << 15, 0.875 },
    } };
    const auto& sc = scenarios[scenario_idx];
    state.SetLabel(sc.name);

    auto all_scalars = build_batch_scalars(sc.k, sc.n, sc.zero_density, engine, scalars);
    std::span<const G1> points = srs->get_monomial_points().subspan(0, sc.n);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        for (size_t m = 0; m < sc.k; ++m) {
            bb::PolynomialSpan<const Fr> sp(0, std::span<const Fr>(all_scalars[m].data(), sc.n));
            (void)bb::scalar_multiplication::pippenger_round_parallel<Curve>(sp, points);
        }
    }
}

/**
 * @brief Batch MSM benchmark variant added to investigate `AztecProtocol/barretenberg#1656`.
 *
 * The issue is concerned about the single-threaded final reduction step in
 * `MSM::batch_multi_scalar_mul(...)` when the work is split across a large number of threads,
 * e.g. `2^16` points with `256` threads.
 *
 * We run a single MSM (num_polys = 1) and sweep thread counts and MSM sizes to make the
 * final reduction overhead visible in the phase breakdown reported via `BB_BENCH` counters.
 */
BENCHMARK_DEFINE_F(PippengerBench, BatchMSM_1656)(benchmark::State& state)
{
    const size_t num_threads = static_cast<size_t>(state.range(0));
    const size_t msm_size = static_cast<size_t>(state.range(1));

    std::vector<Fr> msm_scalars(msm_size);
    for (auto& s : msm_scalars) {
        s = Fr::random_element(&engine);
    }

    std::vector<bb::PolynomialSpan<Fr>> scalar_spans;
    scalar_spans.emplace_back(0, std::span<Fr>(msm_scalars));
    std::span<const G1> points = srs->get_monomial_points().subspan(0, msm_size);

    // This is thread-local: restore after the benchmark so other cases in this binary are unaffected.
    const size_t original_concurrency = bb::get_num_cpus();
    bb::set_parallel_for_concurrency(num_threads);

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        bb::scalar_multiplication::MSM<Curve>::batch_multi_scalar_mul(points, scalar_spans, false);
    }

    bb::set_parallel_for_concurrency(original_concurrency);
}

// ===================== Sparsity-profile single MSM =====================
//
// Single-MSM pippenger_round_parallel across dyadic sizes 2^15..2^19 under two scalar
// distributions, to A/B the thread-pool backend (new generation-counter pool vs the
// merge-train pool) at the workload shapes that stress the round-parallel scaffolding
// and the dedup pre-pass.
//
//   Dense80   — 80% uniformly-random nonzero scalars, 20% zero. Exercises the main
//               bucket-accumulation pipeline with light sparsity. dedup_hint=false.
//   DupHeavy  — 50% unique random, 25% all equal to one random scalar A, 5% all equal
//               to another random scalar B, 20% zero. Heavy duplication drives the
//               Phase A dedup pre-pass (the most thread-intensive stage), so this is
//               the case most sensitive to pool dispatch / oversubscription behavior.
//               dedup_hint=true.
//
// Scalars are drawn from the fixture's deterministic debug RNG so the A/B runs on the
// two pool backends see identical inputs.
namespace {
enum class SparsityProfile : uint8_t { Dense80 = 0, DupHeavy = 1 };

[[nodiscard]] double uniform01(bb::numeric::RNG& engine) noexcept
{
    return static_cast<double>(engine.get_random_uint32()) / static_cast<double>(std::numeric_limits<uint32_t>::max());
}

std::vector<Fr> build_sparsity_scalars(SparsityProfile profile, size_t n, bb::numeric::RNG& engine)
{
    std::vector<Fr> out(n);
    if (profile == SparsityProfile::Dense80) {
        for (size_t i = 0; i < n; ++i) {
            out[i] = (uniform01(engine) < 0.20) ? Fr::zero() : Fr::random_element(&engine);
        }
    } else {
        const Fr dup_a = Fr::random_element(&engine);
        const Fr dup_b = Fr::random_element(&engine);
        for (size_t i = 0; i < n; ++i) {
            const double r = uniform01(engine);
            if (r < 0.20) {
                out[i] = Fr::zero(); // 20% zero
            } else if (r < 0.45) {
                out[i] = dup_a; // 25% duplicate of A
            } else if (r < 0.50) {
                out[i] = dup_b; // 5% duplicate of B
            } else {
                out[i] = Fr::random_element(&engine); // 50% unique random
            }
        }
    }
    return out;
}
} // namespace

BENCHMARK_DEFINE_F(PippengerBench, PippengerSparsity)(benchmark::State& state)
{
    const auto profile = static_cast<SparsityProfile>(state.range(0));
    const size_t num_points = static_cast<size_t>(state.range(1));
    const bool dedup_hint = (profile == SparsityProfile::DupHeavy);
    state.SetLabel(profile == SparsityProfile::Dense80 ? "Dense80" : "DupHeavy");

    // Build the scalar set from a fresh RNG re-seeded deterministically per (profile, size)
    // rather than from the shared advancing engine. Two reasons:
    //   1. Every benchmark repetition (--benchmark_repetitions) reuses the SAME scalars, so the
    //      measured variance reflects pool/scheduler noise only, not input variation.
    //   2. The input is independent of benchmark execution order, so a filtered subset or a
    //      pool-toggled A/B run sees byte-identical scalars — the comparison is properly paired.
    // The scalar build is outside the timed `for (auto _ : state)` loop regardless, so RNG cost
    // never enters the measurement.
    const std::uint_fast64_t case_seed =
        0xC0FFEEULL + (static_cast<std::uint_fast64_t>(profile) << 32) + static_cast<std::uint_fast64_t>(num_points);
    bb::numeric::RNG& case_engine = bb::numeric::get_debug_randomness(/*reset=*/true, /*seed=*/case_seed);

    std::vector<Fr> msm_scalars = build_sparsity_scalars(profile, num_points, case_engine);
    std::span<const G1> points = srs->get_monomial_points().subspan(0, num_points);
    bb::PolynomialSpan<const Fr> poly_scalars(0, std::span<const Fr>(msm_scalars.data(), num_points));

    for (auto _ : state) {
        GOOGLE_BB_BENCH_REPORTER(state);
        (void)bb::scalar_multiplication::pippenger_round_parallel<Curve>(poly_scalars, points, dedup_hint);
    }
}

// ===================== Registration =====================

// Single MSM: 2^14 to 2^20
BENCHMARK_REGISTER_F(PippengerBench, PippengerUnsafe)
    ->Unit(benchmark::kMillisecond)
    ->RangeMultiplier(4)
    ->Range(1 << 14, 1 << 20);

// Sparsity-profile single MSM: {profile (0=Dense80, 1=DupHeavy), size}, sizes 2^15..2^19.
BENCHMARK_REGISTER_F(PippengerBench, PippengerSparsity)
    ->Unit(benchmark::kMillisecond)
    ->ArgsProduct({ { 0, 1 }, { 1 << 15, 1 << 16, 1 << 17, 1 << 18, 1 << 19 } });

// Batch MSM: {num_polynomials, polynomial_size}
// AVM-like: 32 polys of size 2^21 (one batch from ~2618 wire polys committed in batches of 32)
BENCHMARK_REGISTER_F(PippengerBench, BatchMSM)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 32, 1 << 19 })
    ->Args({ 32, 1 << 21 });

// Issue #1656 target: {threads=256, msm_size}
BENCHMARK_REGISTER_F(PippengerBench, BatchMSM_1656)
    ->Unit(benchmark::kMillisecond)
    ->Args({ 256, 1 << 16 })
    ->Args({ 256, 1 << 20 });

// Chonk-representative batched MSM workloads. Scenario index 0..6 indexes into the
// scenario table above. Run "Batched" and "PerMsm" with matching indices and compare.
BENCHMARK_REGISTER_F(PippengerBench, BatchedChonk)->Unit(benchmark::kMillisecond)->DenseRange(0, 4, 1);
BENCHMARK_REGISTER_F(PippengerBench, PerMsmChonk)->Unit(benchmark::kMillisecond)->DenseRange(0, 4, 1);

// Grid sweep for A vs B: {threads, size}. N covers 2^7..2^21 (with extra in-between
// points around the GLV crossover).
BENCHMARK_REGISTER_F(PippengerBench, PippengerRoundParallel)
    ->Unit(benchmark::kMillisecond)
    ->ArgsProduct({ { 1, 4, 8, 12, 16, 32, 64, 128 },
                    { 1 << 7,
                      1 << 8,
                      1 << 9,
                      1 << 10,
                      1 << 11,
                      1 << 12,
                      1 << 13,
                      1 << 14,
                      1 << 15,
                      3 << 14,
                      1 << 16,
                      3 << 15,
                      1 << 17,
                      3 << 16,
                      1 << 18,
                      1 << 19,
                      1 << 20,
                      1 << 21 } });

// Focused per-stage scaling sweep at native concurrency. Run with BB_BENCH=1 for the
// Stage1..Stage7 hierarchical breakdown; filter with --benchmark_filter=PippengerRoundParallelScaling.
BENCHMARK_REGISTER_F(PippengerBench, PippengerRoundParallelScaling)
    ->Unit(benchmark::kMillisecond)
    ->Arg(1 << 17)
    ->Arg(1 << 18)
    ->Arg(1 << 19)
    ->Arg(1 << 20)
    ->Arg(1 << 21);

BENCHMARK_REGISTER_F(PippengerBench, PippengerScalingLegacy)
    ->Unit(benchmark::kMillisecond)
    ->Arg(1 << 17)
    ->Arg(1 << 18)
    ->Arg(1 << 19)
    ->Arg(1 << 20)
    ->Arg(1 << 21);

BENCHMARK_REGISTER_F(PippengerBench, PippengerUnsafeThreads)
    ->Unit(benchmark::kMillisecond)
    ->ArgsProduct({ { 1, 4, 8, 12, 16, 32, 64, 128 },
                    { 1 << 9,
                      1 << 10,
                      1 << 11,
                      1 << 12,
                      1 << 13,
                      1 << 14,
                      1 << 15,
                      1 << 16,
                      1 << 17,
                      1 << 18,
                      1 << 19,
                      1 << 20 } });

} // namespace

BENCHMARK_MAIN();
