/**
 * @brief Small-MSM crossover matrix benchmark.
 *
 * Outputs a single matrix where rows = method and columns = N (number of points).
 * Methods compared:
 *   - jac_fast_mt_always : pippenger_round_parallel_jacobian_fast forced
 *                         maximally-multithreaded (min_pts_per_thread_override = 1).
 *   - jac_fast_st_always : pippenger_round_parallel_jacobian_fast forced
 *                         single-threaded (min_pts_per_thread_override = SIZE_MAX).
 *   - small_mul_threaded : trivial_msm_threaded (bb::parallel_for split,
 *                         per-worker straus or jac_fast based on slice size).
 *   - straus_msm         : Element::straus_msm direct (single-threaded).
 *
 * Two outputs are reported per (method, N):
 *   - Wall-clock median ns per run.
 *   - The MIN_JACOBIAN_SIZE crossover (single-threaded jac_fast vs straus_msm).
 *
 * Build & run:
 *   cd barretenberg/cpp/build && ninja small_msm_matrix_bench
 *   ./bin/small_msm_matrix_bench
 */
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/groups/element.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <algorithm>
#include <chrono>
#include <cstddef>
#include <cstdio>
#include <span>
#include <string>
#include <vector>

using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;
using Element = Curve::Element;

namespace {

// Median wall-clock ns across `iters` invocations of `run`.
template <typename Run> double median_ns(Run&& run, size_t iters)
{
    std::vector<double> samples(iters);
    for (size_t i = 0; i < iters; ++i) {
        const auto t0 = std::chrono::steady_clock::now();
        run();
        const auto t1 = std::chrono::steady_clock::now();
        samples[i] = static_cast<double>(std::chrono::duration_cast<std::chrono::nanoseconds>(t1 - t0).count());
    }
    std::sort(samples.begin(), samples.end());
    return samples[samples.size() / 2];
}

// WASM-tuned iteration counts. Quadrupled from the previous tuning to damp
// per-cell variance — each cell now budgets ~200 ms–1 s wall time.
size_t pick_iters(size_t n)
{
    if (n <= 4) {
        return 800;
    }
    if (n <= 16) {
        return 400;
    }
    if (n <= 64) {
        return 200;
    }
    if (n <= 256) {
        return 100;
    }
    if (n <= 1024) {
        return 32;
    }
    if (n <= 4096) {
        return 16;
    }
    return 8;
}

void print_matrix_header(const std::vector<size_t>& ns)
{
    std::printf("%-24s", "N");
    for (size_t n : ns) {
        std::printf(" %12zu", n);
    }
    std::printf("\n");
}

// `mask[i] == false` skips column i (prints "-" instead of a number).
void print_matrix_row(const char* label, const std::vector<double>& ns_per_run, const std::vector<bool>& mask)
{
    std::printf("%-24s", label);
    for (size_t i = 0; i < ns_per_run.size(); ++i) {
        if (mask[i]) {
            std::printf(" %12.0f", ns_per_run[i]);
        } else {
            std::printf(" %12s", "-");
        }
    }
    std::printf("\n");
}

// Phase 1: precise crossover sweep — at every N in {32, 34, ..., 64}, compare
// single-threaded `straus_msm` against single-threaded `jac_fast`. Returns the
// smallest N where jac_fast wins (or 0 if jac never wins in-range).
size_t run_crossover_sweep(std::span<const G1> all_points, std::span<const Fr> scalars)
{
    std::printf("\n=== MIN_JACOBIAN_SIZE crossover sweep (single-threaded straus_msm vs jac_fast, ns) ===\n\n");
    std::printf("%-8s %12s %12s %10s\n", "N", "straus", "jac_st", "delta_%");

    size_t crossover = 0;
    constexpr size_t REPEATS = 3;
    for (size_t n = 32; n <= 64; n += 2) {
        std::span<const G1> points = all_points.subspan(0, n);
        std::span<const Fr> scalars_view(scalars.data(), n);
        const size_t iters = pick_iters(n);

        std::vector<double> straus_samples(REPEATS);
        std::vector<double> jac_samples(REPEATS);
        for (size_t r = 0; r < REPEATS; ++r) {
            straus_samples[r] = median_ns(
                [&] {
                    volatile auto v = Element::straus_msm(points, scalars_view);
                    (void)v;
                },
                iters);
            jac_samples[r] = median_ns(
                [&] {
                    volatile auto v =
                        bb::scalar_multiplication::round_parallel_detail::pippenger_round_parallel_jacobian_fast<Curve>(
                            scalars_view, points, /*min_pts_per_thread_override=*/SIZE_MAX);
                    (void)v;
                },
                iters);
        }
        std::sort(straus_samples.begin(), straus_samples.end());
        std::sort(jac_samples.begin(), jac_samples.end());
        const double straus = straus_samples[REPEATS / 2];
        const double jac = jac_samples[REPEATS / 2];
        const double delta_pct = 100.0 * (jac - straus) / straus;
        std::printf("%-8zu %12.0f %12.0f %+10.2f\n", n, straus, jac, delta_pct);
        if (crossover == 0 && jac < straus) {
            crossover = n;
        }
    }
    if (crossover != 0) {
        std::printf("\nFirst N where jac_fast_st_always beats straus_msm: %zu\n", crossover);
    } else {
        std::printf("\nstraus_msm wins across the entire 32..64 sweep.\n");
    }
    return crossover;
}

void run_matrix()
{
    constexpr size_t MAX_N = 1U << 14;

    // Initialise SRS once and reuse the same point span across all cells.
    bb::srs::init_file_crs_factory(bb::srs::bb_crs_path());
    auto srs = bb::srs::get_crs_factory<Curve>()->get_crs(MAX_N);
    std::span<const G1> all_points = srs->get_monomial_points().subspan(0, MAX_N);

    bb::numeric::RNG& engine = bb::numeric::get_debug_randomness();
    std::vector<Fr> scalars(MAX_N);
    for (auto& s : scalars) {
        s = Fr::random_element(&engine);
    }

    // Phase 1: precise crossover sweep — disabled for the N=1..128 sub-range run.
    (void)&run_crossover_sweep;

    // Phase 2: full matrix.
    // Column set — sweep small-MSM regime where the four methods can disagree.
    // Includes powers of 2 plus a few intermediate values around the suspected
    // jacobian crossover, extended out to 16384 since small_mul_threaded was
    // still beating jac_fast_mt at 8192.
    const std::vector<size_t> ns = {
        1,   2,   3,   4,   6,   8,   12,   16,   24,   32,   48,    64,    96,
        128, 192, 256, 384, 512, 768, 1024, 2048, 4096, 8192, 12288, 16384,
    };

    // Per-column masks. straus_msm is dropped at N >= 256 (its naive double-and-add
    // cost dominates the schedule and saturates the iteration budget). The two
    // pippenger_round_parallel variants kick in at N >= 64.
    std::vector<bool> straus_mask(ns.size());
    std::vector<bool> internal_mask(ns.size());
    for (size_t i = 0; i < ns.size(); ++i) {
        straus_mask[i] = (ns[i] < 256);
        internal_mask[i] = (ns[i] >= 64);
    }
    std::vector<bool> all_mask(ns.size(), true);

    std::vector<double> row_jac_mt(ns.size());
    std::vector<double> row_jac_st(ns.size());
    std::vector<double> row_threaded(ns.size());
    std::vector<double> row_straus(ns.size());
    std::vector<double> row_internal(ns.size());

    for (size_t col = 0; col < ns.size(); ++col) {
        const size_t n = ns[col];
        std::span<const G1> points = all_points.subspan(0, n);
        std::span<const Fr> scalars_view(scalars.data(), n);
        std::span<Fr> mut_scalars_view(scalars.data(), n);
        bb::PolynomialSpan<const Fr> poly_scalars(0, scalars_view);
        bb::PolynomialSpan<Fr> mut_poly_scalars(0, mut_scalars_view);
        const size_t iters = pick_iters(n);

        row_jac_mt[col] = median_ns(
            [&] {
                volatile auto r =
                    bb::scalar_multiplication::round_parallel_detail::pippenger_round_parallel_jacobian_fast<Curve>(
                        scalars_view, points, /*min_pts_per_thread_override=*/1);
                (void)r;
            },
            iters);

        row_jac_st[col] = median_ns(
            [&] {
                volatile auto r =
                    bb::scalar_multiplication::round_parallel_detail::pippenger_round_parallel_jacobian_fast<Curve>(
                        scalars_view, points, /*min_pts_per_thread_override=*/SIZE_MAX);
                (void)r;
            },
            iters);

        row_threaded[col] = median_ns(
            [&] {
                volatile auto r = bb::scalar_multiplication::trivial_msm_threaded<Curve>(poly_scalars, points);
                (void)r;
            },
            iters);

        if (straus_mask[col]) {
            row_straus[col] = median_ns(
                [&] {
                    volatile auto r = Element::straus_msm(points, scalars_view);
                    (void)r;
                },
                iters);
        }

        if (internal_mask[col]) {
            row_internal[col] = median_ns(
                [&] {
                    volatile auto r =
                        bb::scalar_multiplication::pippenger_round_parallel<Curve>(mut_poly_scalars, points);
                    (void)r;
                },
                iters);
        }
    }

    std::printf("\n=== small-MSM crossover matrix (median wall-clock ns per run, BN254) ===\n\n");
    print_matrix_header(ns);
    print_matrix_row("jac_fast_mt_always", row_jac_mt, all_mask);
    print_matrix_row("jac_fast_st_always", row_jac_st, all_mask);
    print_matrix_row("small_mul_threaded", row_threaded, all_mask);
    print_matrix_row("straus_msm", row_straus, straus_mask);
    print_matrix_row("pippenger_internal", row_internal, internal_mask);

    // Best method per N — masked candidates are excluded from the comparison.
    std::printf("\nBest method per N:\n");
    for (size_t i = 0; i < ns.size(); ++i) {
        struct Cand {
            const char* name;
            double v;
            bool active;
        };
        std::array<Cand, 5> c{ { { "jac_mt", row_jac_mt[i], true },
                                 { "jac_st", row_jac_st[i], true },
                                 { "threaded", row_threaded[i], true },
                                 { "straus", row_straus[i], straus_mask[i] },
                                 { "internal", row_internal[i], internal_mask[i] } } };
        const Cand* best = nullptr;
        for (const Cand& cand : c) {
            if (cand.active && (best == nullptr || cand.v < best->v)) {
                best = &cand;
            }
        }
        std::printf("  N=%-6zu best=%-12s (%.0f ns)\n", ns[i], best->name, best->v);
    }
}

} // namespace

int main()
{
    run_matrix();
    return 0;
}
