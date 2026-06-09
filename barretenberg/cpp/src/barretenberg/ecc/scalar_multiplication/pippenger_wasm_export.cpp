// WASM_EXPORT entry for benchmarking round-parallel Pippenger under Node/V8 (via bb.js), the
// engine the browser uses. Wasmtime/Cranelift numbers do not predict V8; this lets the same
// per-stage breakdown collected natively (BB_BENCH) be measured under real V8.
//
// Driven by ts/scripts/pippenger_v8_bench.mjs through `callWasmExport`. Self-contained: it mints
// `num_points` distinct on-curve points (random base + Jacobian running-sum + one batch-normalise,
// so no CRS load is needed) and random scalars, then times `pippenger_round_parallel` over
// `num_iters` runs. Per-iteration wall time and (when built with ENABLE_WASM_BENCH) the
// Stage1..Stage7 hierarchical breakdown are emitted via `info()`, which bb.js surfaces to stdout.

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp" // legacy:: + facade
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication_fast.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/polynomials/polynomial.hpp"
#include "barretenberg/srs/global_crs.hpp"

#include <chrono>
#include <cstdint>
#include <span>
#include <vector>

#if defined(ENABLE_WASM_BENCH) || !defined(__wasm__)
#include "barretenberg/common/bb_bench.hpp"
#include <sstream>
#endif

namespace {
using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using G1 = Curve::AffineElement;
} // namespace

// num_points / num_iters / use_legacy are passed as raw i32 args by `callWasmExport`
// (HeapAllocator forwards `number` inputs verbatim). use_legacy != 0 runs the byte-identical
// legacy MSM (legacy::pippenger_unsafe), else the round-parallel rewrite — both over the same
// SRS points, for an apples-to-apples per-stage comparison under V8. No output buffer: results
// are reported through `info()`.
WASM_EXPORT void bench_pippenger_round_parallel(uint32_t num_points, uint32_t num_iters, uint32_t use_legacy)
{
    auto& rng = bb::numeric::get_debug_randomness();

    // Points come from the global SRS the JS runner loaded (Barretenberg.new initSRSChonk) — the
    // same monomial points the native pippenger_bench uses, so they satisfy the no-equal-x
    // precondition and are representative of the real commitment workload.
    auto crs = bb::srs::get_crs_factory<Curve>()->get_crs(num_points);
    std::span<const G1> point_span = crs->get_monomial_points().subspan(0, num_points);

    std::vector<Fr> scalars(num_points);
    for (auto& s : scalars) {
        s = Fr::random_element(&rng);
    }
    bb::PolynomialSpan<Fr> poly_scalars(0, std::span<Fr>(scalars.data(), num_points));

    for (uint32_t it = 0; it < num_iters; ++it) {
#if defined(ENABLE_WASM_BENCH) || !defined(__wasm__)
        bb::detail::use_bb_bench = true;
        bb::detail::GLOBAL_BENCH_STATS.clear();
#endif
        const auto t0 = std::chrono::steady_clock::now();
        if (use_legacy != 0) {
            (void)bb::scalar_multiplication::legacy::pippenger_unsafe<Curve>(poly_scalars, point_span);
        } else {
            (void)bb::scalar_multiplication::pippenger_round_parallel<Curve>(poly_scalars, point_span);
        }
        const auto t1 = std::chrono::steady_clock::now();
        const double ms = std::chrono::duration_cast<std::chrono::duration<double, std::milli>>(t1 - t0).count();
        info("[pippenger-v8] impl=",
             (use_legacy != 0 ? "legacy" : "fast"),
             " n=",
             num_points,
             " iter ",
             it,
             (it == 0 ? " (warmup)" : ""),
             ": ",
             ms,
             " ms");

#if defined(ENABLE_WASM_BENCH) || !defined(__wasm__)
        // Per-stage tree on the final iteration (V8 has tiered up by then).
        if (it + 1 == num_iters) {
            std::ostringstream oss;
            bb::detail::GLOBAL_BENCH_STATS.print_aggregate_counts_hierarchical(oss);
            info("[pippenger-v8] per-stage breakdown impl=",
                 (use_legacy != 0 ? "legacy" : "fast"),
                 " n=",
                 num_points,
                 ":\n",
                 oss.str());
        }
#endif
    }
}
