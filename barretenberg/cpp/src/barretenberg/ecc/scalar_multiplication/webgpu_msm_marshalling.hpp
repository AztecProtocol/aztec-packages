#pragma once

// Layout marshalling helpers for the BN254 WebGPU MSM bridge.
//
// Kept in its own header (not gated by BBERG_WEBGPU_MSM_HOOK) so the
// round-trip can be unit-tested in any build. The hook's JS imports
// and the C++→GPU dispatch live in webgpu_msm_hook.{hpp,cpp} and are
// the only parts that depend on the WASM target.
//
// Layout contract (matches the JS side; see barretenberg/ts/src/msm_webgpu/):
//   points  — n × 64 bytes, [x[32] || y[32]] per point, LE, NOT Montgomery
//   scalars — n × 32 bytes (Fr), LE, NOT Montgomery
//   result  — num_windows × 64 bytes: the per-window sums, [x[32] || y[32]]
//             each, LE NOT Montgomery; `combine_windows` folds them to the point
//
// `static_cast<uint256_t>(field)` strips Montgomery form (canonical
// representation); the `BaseField(uint256_t)` constructor re-wraps
// the per-window sums returned by the GPU.

#include <cstdint>
#include "barretenberg/common/thread.hpp"
#include <cstring>
#include <span>
#include <vector>

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::scalar_multiplication::webgpu_marshalling {

inline void write_uint256_le(uint8_t* out, const numeric::uint256_t& u) noexcept
{
    for (int i = 0; i < 4; ++i) {
        uint64_t w = u.data[i];
        for (int j = 0; j < 8; ++j) {
            out[i * 8 + j] = static_cast<uint8_t>(w >> (j * 8));
        }
    }
}

inline numeric::uint256_t read_uint256_le(const uint8_t* in) noexcept
{
    numeric::uint256_t u;
    for (int i = 0; i < 4; ++i) {
        uint64_t w = 0;
        for (int j = 0; j < 8; ++j) {
            w |= static_cast<uint64_t>(in[i * 8 + j]) << (j * 8);
        }
        u.data[i] = w;
    }
    return u;
}

inline std::vector<uint8_t> marshal_points(std::span<const curve::BN254::AffineElement> points)
{
    std::vector<uint8_t> out(points.size() * 64);
    for (size_t i = 0; i < points.size(); ++i) {
        const auto& p = points[i];
        // Point-at-infinity is rare in practice (SRS contains none) but
        // we encode it as all-zero bytes so the GPU MSM treats it as
        // having zero contribution. (point=O, scalar=k) must still
        // round-trip cleanly.
        if (p.is_point_at_infinity()) {
            std::memset(&out[i * 64], 0, 64);
            continue;
        }
        write_uint256_le(&out[i * 64], static_cast<numeric::uint256_t>(p.x));
        write_uint256_le(&out[i * 64 + 32], static_cast<numeric::uint256_t>(p.y));
    }
    return out;
}

inline std::vector<uint8_t> marshal_scalars(std::span<const curve::BN254::ScalarField> scalars)
{
    std::vector<uint8_t> out(scalars.size() * 32);
    for (size_t i = 0; i < scalars.size(); ++i) {
        write_uint256_le(&out[i * 32], static_cast<numeric::uint256_t>(scalars[i]));
    }
    return out;
}

inline curve::BN254::AffineElement read_affine_le(const uint8_t* buf)
{
    const numeric::uint256_t x = read_uint256_le(buf);
    const numeric::uint256_t y = read_uint256_le(buf + 32);
    // (0, 0) is the GPU/marshalling encoding of point-at-infinity (matches
    // marshal_points). An empty per-window bucket sum naturally serialises
    // as 64 zero bytes; without this check the Horner combine in
    // combine_windows would treat (0,0) as a valid affine and trigger
    // invert(0) on the first doubling.
    if (x == 0 && y == 0) {
        return curve::BN254::AffineElement::infinity();
    }
    curve::BN254::AffineElement result;
    result.x = curve::BN254::BaseField(x);
    result.y = curve::BN254::BaseField(y);
    return result;
}

// Horner-combine the per-window sums into the final MSM point. `buf` holds
// `num_windows × 64` LE non-Montgomery bytes — window `w`'s weighted sum at
// `buf[w * 64]`, lowest window first. `c` is the Pippenger window bit width;
// the fold is `acc = acc · 2^c + L[w]` over the windows, high to low. Runs in
// native bb::g1 — the production replacement for the JS host-side combine.
inline curve::BN254::AffineElement combine_windows(const uint8_t* buf, uint32_t num_windows, uint32_t c)
{
    if (num_windows == 0) {
        return curve::BN254::AffineElement::infinity();
    }
    curve::BN254::Element acc{ read_affine_le(&buf[static_cast<size_t>(num_windows - 1) * 64]) };
    for (int w = static_cast<int>(num_windows) - 2; w >= 0; --w) {
        for (uint32_t d = 0; d < c; ++d) {
            acc.self_dbl();
        }
        acc += read_affine_le(&buf[static_cast<size_t>(w) * 64]);
    }
    return curve::BN254::AffineElement{ acc };
}

// --- Early-exit (halving-reduce staged partials) -----------------------------
//
// In early-exit mode the GPU stops BEFORE its final per-window finishing
// dispatch and ships every window's staged partial points instead: the
// unscaled weighted partial plus the scaled carry totals of the halving
// reduction. Layout: `num_windows × partials_per_window` records of 96
// bytes — Jacobian (x, y, z), four 64-bit limbs per coordinate, LE, in
// MONTGOMERY form exactly as the GPU holds them (bb::fq is internally
// Montgomery, so the limbs are adopted directly; no conversion anywhere in
// the chain). z == 0 encodes the point at infinity / an absent partial.

inline curve::BN254::BaseField read_fq_mont_le(const uint8_t* buf)
{
    curve::BN254::BaseField f;
    for (size_t i = 0; i < 4; ++i) {
        uint64_t limb = 0;
        for (size_t b = 0; b < 8; ++b) {
            limb |= static_cast<uint64_t>(buf[i * 8 + b]) << (8 * b);
        }
        f.data[i] = limb;
    }
    return f;
}

inline curve::BN254::Element read_jacobian_mont_le(const uint8_t* buf)
{
    const curve::BN254::BaseField z = read_fq_mont_le(buf + 64);
    if (z.is_zero()) {
        curve::BN254::Element inf;
        inf.self_set_infinity();
        return inf;
    }
    curve::BN254::Element p;
    p.x = read_fq_mont_le(buf);
    p.y = read_fq_mont_le(buf + 32);
    p.z = z;
    return p;
}

// Finish + combine in one native call: sum each window's staged partials
// (independent across windows — parallelised over the thread pool), then
// Horner-fold the window sums exactly as `combine_windows`. `buf` holds
// `num_windows × partials_per_window × 96` bytes as described above.
inline curve::BN254::AffineElement finish_and_combine_windows(const uint8_t* buf,
                                                              uint32_t num_windows,
                                                              uint32_t partials_per_window,
                                                              uint32_t c)
{
    if (num_windows == 0 || partials_per_window == 0) {
        return curve::BN254::AffineElement::infinity();
    }
    std::vector<curve::BN254::Element> window_sums(num_windows);
    parallel_for(num_windows, [&](size_t w) {
        const uint8_t* wbuf = buf + static_cast<size_t>(w) * partials_per_window * 96;
        curve::BN254::Element acc;
        acc.self_set_infinity();
        for (uint32_t p = 0; p < partials_per_window; ++p) {
            acc += read_jacobian_mont_le(wbuf + static_cast<size_t>(p) * 96);
        }
        window_sums[w] = acc;
    });
    curve::BN254::Element acc = window_sums[num_windows - 1];
    for (int w = static_cast<int>(num_windows) - 2; w >= 0; --w) {
        for (uint32_t d = 0; d < c; ++d) {
            acc.self_dbl();
        }
        acc += window_sums[static_cast<size_t>(w)];
    }
    return curve::BN254::AffineElement{ acc };
}

} // namespace bb::scalar_multiplication::webgpu_marshalling
