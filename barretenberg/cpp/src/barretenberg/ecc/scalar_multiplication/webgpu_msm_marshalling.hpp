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

// Same Horner fold over per-window sums already in native form (no serialise /
// read_affine_le round-trip). For the CPU reduce-tail completion, whose
// per-window sums are live g1 elements — they feed the window doublings
// directly, staying in C++.
inline curve::BN254::AffineElement combine_windows(std::span<const curve::BN254::Element> sums, uint32_t c)
{
    if (sums.empty()) {
        return curve::BN254::AffineElement::infinity();
    }
    curve::BN254::Element acc = sums[sums.size() - 1];
    for (int w = static_cast<int>(sums.size()) - 2; w >= 0; --w) {
        for (uint32_t d = 0; d < c; ++d) {
            acc.self_dbl();
        }
        acc += sums[static_cast<size_t>(w)];
    }
    return curve::BN254::AffineElement{ acc };
}

} // namespace bb::scalar_multiplication::webgpu_marshalling
