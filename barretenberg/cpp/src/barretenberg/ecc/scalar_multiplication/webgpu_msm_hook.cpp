#include "webgpu_msm_hook.hpp"

#ifdef BBERG_WEBGPU_MSM_HOOK

#include <array>
#include <atomic>

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "webgpu_msm_marshalling.hpp"

namespace bb::scalar_multiplication {

namespace {

// Track whether we've already pushed the SRS to the WebGPU host. The
// MSM call boundary doesn't expose "is this the first commit of the
// session" directly — we treat the largest points span across the
// first batch we see as the SRS and only upload it once. Subsequent
// commits read a shorter prefix of the same base array.
//
// Atomic for paranoia, but in practice this code only runs on the WASM
// build which is single-threaded under NO_MULTITHREADING.
std::atomic<const uint8_t*> g_published_srs_base{ nullptr };
std::atomic<uint32_t> g_published_srs_count{ 0 };

} // namespace

std::vector<curve::BN254::AffineElement> batch_multi_scalar_mul_webgpu_bn254(
    std::span<std::span<const curve::BN254::AffineElement>> points,
    std::span<std::span<curve::BN254::ScalarField>> scalars) noexcept
{
    using webgpu_marshalling::combine_windows;
    using webgpu_marshalling::marshal_points;
    using webgpu_marshalling::marshal_scalars;

    const size_t batch_size = points.size();
    std::vector<curve::BN254::AffineElement> results;
    results.reserve(batch_size);

    if (g_published_srs_base.load(std::memory_order_relaxed) == nullptr && batch_size > 0) {
        size_t largest_idx = 0;
        for (size_t i = 1; i < batch_size; ++i) {
            if (points[i].size() > points[largest_idx].size()) {
                largest_idx = i;
            }
        }
        const auto& srs_span = points[largest_idx];
        if (!srs_span.empty()) {
            std::vector<uint8_t> srs_bytes = marshal_points(srs_span);
            bb_publish_srs_bn254(srs_bytes.data(), static_cast<uint32_t>(srs_span.size()));
            g_published_srs_base.store(reinterpret_cast<const uint8_t*>(srs_span.data()), std::memory_order_relaxed);
            g_published_srs_count.store(static_cast<uint32_t>(srs_span.size()), std::memory_order_relaxed);
        }
    }

    for (size_t i = 0; i < batch_size; ++i) {
        const size_t n = scalars[i].size();
        if (n == 0) {
            results.push_back(curve::BN254::AffineElement::infinity());
            continue;
        }

        // A small MSM is not worth the bridge round-trip — compute it natively.
        if (n < webgpu_msm_native_max_n) {
            std::array<std::span<const curve::BN254::AffineElement>, 1> p{ points[i].subspan(0, n) };
            std::array<std::span<curve::BN254::ScalarField>, 1> s{ scalars[i] };
            results.push_back(MSM<curve::BN254>::batch_multi_scalar_mul_native(p, s, false)[0]);
            continue;
        }

        // When this MSM's points are a prefix of the published SRS (the common
        // case), the host already holds the converted point pool — send only
        // the scalars and a null points pointer.
        const auto* pts = reinterpret_cast<const uint8_t*>(points[i].data());
        const bool is_srs_prefix = pts == g_published_srs_base.load(std::memory_order_relaxed) &&
                                   n <= g_published_srs_count.load(std::memory_order_relaxed);
        std::vector<uint8_t> points_bytes;
        const uint8_t* points_arg = nullptr;
        if (!is_srs_prefix) {
            points_bytes = marshal_points(points[i].subspan(0, n));
            points_arg = points_bytes.data();
        }
        std::vector<uint8_t> scalars_bytes = marshal_scalars(scalars[i]);

        // Result region holds the per-window sums: at most 64 windows (254-bit
        // scalar field, minimum 4-bit Pippenger window) of 64 bytes each.
        uint8_t result_bytes[64 * 64];
        const uint32_t meta =
            bb_external_msm_bn254(points_arg, scalars_bytes.data(), static_cast<uint32_t>(n), result_bytes);
        const uint32_t num_windows = meta >> 16;
        const uint32_t c = meta & 0xffffu;
        BB_ASSERT(num_windows <= 64, "webgpu MSM: num_windows exceeds the 64-window result buffer");
        results.push_back(combine_windows(result_bytes, num_windows, c));
    }

    return results;
}

} // namespace bb::scalar_multiplication

// ---------------------------------------------------------------------------
// In-browser comparison harness exports.
//
// The dev page (barretenberg/ts/dev/msm-webgpu) benchmarks the in-tree
// Pippenger against the WebGPU MSM. To measure compute and not marshalling,
// the path is split like MsmV2's prepare/run:
//
//   bb_native_pippenger_bn254_load(points, scalars, n)
//     Decode the n × 64 LE point bytes and n × 32 LE scalar bytes into
//     AffineElement / ScalarField vectors held in module state. UNTIMED.
//   bb_native_pippenger_bn254_run(num_threads, result)
//     Run batch_multi_scalar_mul_native over the loaded vectors and write the
//     64-byte LE affine result. The TIMED call — pure Pippenger compute, no
//     input-structure population.
//
// Layout (matches webgpu_msm_marshalling.hpp and the JS dev page; LE, NOT
// Montgomery): points n × 64 `[x[32]||y[32]]`, scalars n × 32 (Fr), result
// 64 `[x[32]||y[32]]`. `num_threads == 0` keeps the runtime default; non-zero
// temporarily overrides the global concurrency for the call.
// batch_multi_scalar_mul_native is the in-tree affine Pippenger that bypasses
// the BBERG_WEBGPU_MSM_HOOK delegation — see bb_native_pippenger_bn254_run.
namespace {
std::vector<bb::curve::BN254::AffineElement> g_bench_points;
std::vector<bb::curve::BN254::ScalarField> g_bench_scalars;
} // namespace

WASM_EXPORT void bb_native_pippenger_bn254_load(const uint8_t* points, const uint8_t* scalars, uint32_t n)
{
    using Curve = bb::curve::BN254;
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;

    // Free the previous size's vectors before allocating this size's. A sweep
    // calls _load for a growing sequence of n; resizing in place would
    // reallocate while still holding the old buffer, transiently doubling the
    // resident input memory in the WASM heap.
    g_bench_points = std::vector<Curve::AffineElement>{};
    g_bench_scalars = std::vector<Curve::ScalarField>{};
    g_bench_points.resize(n);
    g_bench_scalars.resize(n);
    for (uint32_t i = 0; i < n; ++i) {
        g_bench_points[i] = marshalling::read_affine_le(&points[i * 64]);
    }
    for (uint32_t i = 0; i < n; ++i) {
        g_bench_scalars[i] = Curve::ScalarField(marshalling::read_uint256_le(&scalars[i * 32]));
    }
}

WASM_EXPORT void bb_native_pippenger_bn254_run(uint32_t num_threads, uint8_t* result)
{
    using Curve = bb::curve::BN254;
    using MSM = bb::scalar_multiplication::MSM<Curve>;
    namespace marshalling = bb::scalar_multiplication::webgpu_marshalling;

    std::memset(result, 0, 64);
    if (g_bench_scalars.empty()) {
        return;
    }

    const size_t saved_concurrency = bb::get_num_cpus();
    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(num_threads);
    }
    // batch_multi_scalar_mul_native — the in-tree multithreaded affine Pippenger
    // (handle_edge_cases = false: assumes linearly independent points). This is
    // the exact algorithm pippenger_unsafe runs, but it bypasses the
    // BBERG_WEBGPU_MSM_HOOK delegation. pippenger_unsafe -> MSM::msm ->
    // batch_multi_scalar_mul would route a >= webgpu_msm_min_n (2^16) BN254 MSM
    // into the WebGPU bridge — which this comparison harness never installs — and
    // throw. batch_multi_scalar_mul_native exists for exactly this dev-harness use
    // (see its declaration in scalar_multiplication.hpp). It restores the scalars
    // to Montgomery form before returning, so repeated runs over the same loaded
    // g_bench_scalars are safe.
    std::array<std::span<const Curve::AffineElement>, 1> points_batch{ std::span<const Curve::AffineElement>(
        g_bench_points) };
    std::array<std::span<Curve::ScalarField>, 1> scalars_batch{ std::span<Curve::ScalarField>(g_bench_scalars) };
    const Curve::AffineElement aff = MSM::batch_multi_scalar_mul_native(points_batch, scalars_batch, false)[0];
    if (num_threads != 0) {
        bb::set_parallel_for_concurrency(saved_concurrency);
    }

    if (!aff.is_point_at_infinity()) {
        marshalling::write_uint256_le(&result[0], static_cast<bb::numeric::uint256_t>(aff.x));
        marshalling::write_uint256_le(&result[32], static_cast<bb::numeric::uint256_t>(aff.y));
    }
}

#endif // BBERG_WEBGPU_MSM_HOOK
