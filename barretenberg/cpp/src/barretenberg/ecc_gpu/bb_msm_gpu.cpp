#include "bb_msm_gpu.hpp"

#include "barretenberg/common/assert.hpp"
#include "barretenberg/common/throw_or_abort.hpp"

#include <cstring>
#include <map>
#include <mutex>
#include <vector>

namespace bb::scalar_multiplication::gpu {

using Curve = curve::BN254;
using Element = Curve::Element;
using AffineElement = Curve::AffineElement;
using Fr = Curve::ScalarField;

static_assert(sizeof(AffineElement) == sizeof(AffinePointRaw), "bb affine point layout mismatch vs GPU boundary");
static_assert(sizeof(Element) == sizeof(JacobianPointRaw), "bb jacobian point layout mismatch vs GPU boundary");
static_assert(sizeof(Fr) == 4 * sizeof(uint64_t), "bb fr layout mismatch vs GPU boundary");
static_assert(std::is_trivially_copyable_v<AffineElement>);
static_assert(std::is_trivially_copyable_v<Curve::BaseField>);

namespace {

// The GPU boundary takes canonical standard-form (non-Montgomery) scalar limbs; the
// host-side conversion here costs one field mul per scalar (the CPU MSM pays the same
// conversion) and side-steps sppark's device-side mont path, which produced wrong
// results for large scalars on sm_89 while its canonical path matches upstream's own
// correctness tests. Caller buffers are left untouched (the CPU path converts in place
// and restores). `pad` leading zero scalars align scalar j with resident point
// start_index + j.
std::vector<Fr> stage_scalars(PolynomialSpan<const Fr> scalars, size_t pad)
{
    std::vector<Fr> staged(pad, Fr::zero());
    staged.reserve(pad + scalars.span.size());
    for (const Fr& s : scalars.span) {
        // The _reduced variant matters: plain from_montgomery_form() may return values
        // in [r, 2r) for coarse inputs, which the GPU would decompose as a different
        // integer.
        staged.emplace_back(s.from_montgomery_form_reduced());
    }
    return staged;
}

// Element is not trivially copyable (user-provided constructors), so copy per field.
Element to_element(const JacobianPointRaw& raw)
{
    Element result;
    std::memcpy(&result.x, raw.x, sizeof(raw.x));
    std::memcpy(&result.y, raw.y, sizeof(raw.y));
    std::memcpy(&result.z, raw.z, sizeof(raw.z));
    if (result.z.is_zero()) {
        result.self_set_infinity();
    }
    return result;
}

} // namespace

bool msm_available() noexcept
{
    return available();
}

curve::BN254::Element pippenger_bn254_oneshot(PolynomialSpan<const Fr> scalars, std::span<const AffineElement> points)
{
    BB_ASSERT_LTE(scalars.start_index + scalars.span.size(), points.size());
    if (scalars.span.empty()) {
        Element out;
        out.self_set_infinity();
        return out;
    }
    std::vector<Fr> staged = stage_scalars(scalars, /*pad=*/0);
    JacobianPointRaw raw;
    int rc = msm_oneshot_bn254(raw,
                               reinterpret_cast<const AffinePointRaw*>(points.data() + scalars.start_index),
                               reinterpret_cast<const uint64_t*>(staged.data()),
                               staged.size());
    if (rc != 0) {
        throw_or_abort("GPU MSM failed with code " + std::to_string(rc));
    }
    return to_element(raw);
}

bool try_pippenger_bn254(Element& out, PolynomialSpan<const Fr> scalars, std::span<const AffineElement> points) noexcept
{
    if (!available()) {
        return false;
    }
    BB_ASSERT_LTE(scalars.start_index + scalars.span.size(), points.size());
    if (scalars.span.empty()) {
        out.self_set_infinity();
        return true;
    }

    // Resident-context cache keyed on the points base pointer (SRS spans for successive
    // calls share their base and only grow). sppark's msm_t is not thread-safe, so all
    // GPU work is serialised behind one mutex.
    static std::mutex cache_mutex;
    static std::map<const AffineElement*, MsmContextBn254> contexts;

    std::lock_guard<std::mutex> lock(cache_mutex);

    auto it = contexts.find(points.data());
    if (it == contexts.end() || it->second.size() < points.size()) {
        if (it != contexts.end()) {
            contexts.erase(it);
        }
        MsmContextBn254 ctx(reinterpret_cast<const AffinePointRaw*>(points.data()), points.size());
        if (!ctx.valid()) {
            return false;
        }
        it = contexts.emplace(points.data(), std::move(ctx)).first;
    }

    std::vector<Fr> staged = stage_scalars(scalars, /*pad=*/scalars.start_index);
    JacobianPointRaw raw;
    int rc = it->second.msm(raw, reinterpret_cast<const uint64_t*>(staged.data()), staged.size());
    if (rc != 0) {
        return false;
    }
    out = to_element(raw);
    return true;
}

bool try_pippenger_bn254_canonical(Element& out,
                                   size_t start_index,
                                   const uint64_t* scalars_canonical,
                                   size_t num_scalars,
                                   std::span<const AffineElement> points) noexcept
{
    if (!available()) {
        return false;
    }
    BB_ASSERT_LTE(start_index + num_scalars, points.size());
    if (num_scalars == 0) {
        out.self_set_infinity();
        return true;
    }

    static std::mutex cache_mutex;
    static std::map<const AffineElement*, MsmContextBn254> contexts;

    // Small offsets are absorbed by zero-padding the scalars against the base context
    // (cheap). Large offsets — chunked requests over a big SRS — instead anchor a
    // resident context at the offset point so no padding transfer is needed; distinct
    // offsets are bounded by the client's chunk granularity and each uploads once.
    static constexpr size_t SMALL_PAD_LIMIT = 1024;
    const bool pad_mode = start_index <= SMALL_PAD_LIMIT;
    const AffineElement* anchor = pad_mode ? points.data() : points.data() + start_index;
    const size_t anchor_size = pad_mode ? points.size() : points.size() - start_index;

    std::lock_guard<std::mutex> lock(cache_mutex);

    auto it = contexts.find(anchor);
    if (it == contexts.end() || it->second.size() < anchor_size) {
        if (it != contexts.end()) {
            contexts.erase(it);
        }
        MsmContextBn254 ctx(reinterpret_cast<const AffinePointRaw*>(anchor), anchor_size);
        if (!ctx.valid()) {
            return false;
        }
        it = contexts.emplace(anchor, std::move(ctx)).first;
    }

    JacobianPointRaw raw;
    int rc = 0;
    if (pad_mode && start_index != 0) {
        std::vector<uint64_t> staged(4 * (start_index + num_scalars), 0);
        std::memcpy(staged.data() + 4 * start_index, scalars_canonical, num_scalars * 4 * sizeof(uint64_t));
        rc = it->second.msm(raw, staged.data(), start_index + num_scalars);
    } else {
        // Zero-copy: the wire buffer (e.g. the SHM ring) is consumed directly.
        rc = it->second.msm(raw, scalars_canonical, num_scalars);
    }
    if (rc != 0) {
        return false;
    }
    out = to_element(raw);
    return true;
}

} // namespace bb::scalar_multiplication::gpu
