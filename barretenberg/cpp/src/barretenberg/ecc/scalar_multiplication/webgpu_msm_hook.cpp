#include "webgpu_msm_hook.hpp"

#ifdef BBERG_WEBGPU_MSM_HOOK

#include <atomic>

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
    using webgpu_marshalling::marshal_points;
    using webgpu_marshalling::marshal_scalars;
    using webgpu_marshalling::read_affine_le;

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

        std::vector<uint8_t> points_bytes = marshal_points(points[i].subspan(0, n));
        std::vector<uint8_t> scalars_bytes = marshal_scalars(scalars[i]);

        uint8_t result_bytes[64];
        bb_external_msm_bn254(points_bytes.data(), scalars_bytes.data(), static_cast<uint32_t>(n), result_bytes);

        results.push_back(read_affine_le(result_bytes));
    }

    return results;
}

} // namespace bb::scalar_multiplication

#endif // BBERG_WEBGPU_MSM_HOOK
