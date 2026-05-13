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
//   result  — 64 bytes,           [x[32] || y[32]], LE, NOT Montgomery
//
// `static_cast<uint256_t>(field)` strips Montgomery form (canonical
// representation); the `BaseField(uint256_t)` constructor re-wraps
// the result returned by the GPU.

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
    curve::BN254::AffineElement result;
    result.x = curve::BN254::BaseField(read_uint256_le(buf));
    result.y = curve::BN254::BaseField(read_uint256_le(buf + 32));
    return result;
}

} // namespace bb::scalar_multiplication::webgpu_marshalling
