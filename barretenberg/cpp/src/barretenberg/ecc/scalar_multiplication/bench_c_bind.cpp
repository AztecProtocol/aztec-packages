// Raw WASM_EXPORT entry point for benchmarking BN254 G1 Pippenger MSM.
//
// Intentionally bypasses bbapi/msgpack — the canonical byte format used by the
// ecc-tests benchmark harness is flat, little-endian, non-Montgomery. Going
// through msgpack would add per-point TypedArray overhead that dominates
// measurement at ~2^20.
//
// Input encoding (must match harness/src/vectors.ts):
//   points_bytes:  size * 64 bytes  -- affine [x_le || y_le], non-Montgomery;
//                                       (0, 0) == point at infinity
//   scalars_bytes: size * 32 bytes  -- scalar LE, non-Montgomery
//
// Output encoding:
//   out_bytes:     64 bytes         -- affine [x_le || y_le], non-Montgomery;
//                                       (0, 0) == point at infinity
//
// This file is auto-picked up by barretenberg_module() (file(GLOB_RECURSE *.cpp))
// so no CMakeLists.txt edit is required.

#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/polynomials/polynomial.hpp"

#include <cstdint>
#include <cstring>
#include <span>
#include <vector>

namespace {

// --- Little-endian uint64 load/store ------------------------------------------------
// std::memcpy to a uint64_t on any supported target is little-endian-safe on
// x86_64, aarch64, and wasm32 (all little-endian). We rely on that.

static inline uint64_t load_le_u64(uint8_t const* p) noexcept
{
    uint64_t v;
    std::memcpy(&v, p, sizeof(uint64_t));
    return v;
}

static inline void store_le_u64(uint8_t* p, uint64_t v) noexcept
{
    std::memcpy(p, &v, sizeof(uint64_t));
}

// Read a 32-byte LE non-Montgomery scalar into a bb::fr.
// The bb::fr(uint256_t) constructor applies self_to_montgomery_form() internally,
// so the returned field element is in the form the Pippenger impl expects.
static inline bb::fr decode_fr_le(uint8_t const* p) noexcept
{
    bb::numeric::uint256_t raw{ load_le_u64(p),
                                load_le_u64(p + 8),
                                load_le_u64(p + 16),
                                load_le_u64(p + 24) };
    return bb::fr(raw);
}

// Read a 64-byte LE affine point (x_le || y_le, non-Montgomery).
// (0, 0) decodes to the canonical point at infinity.
static inline bb::g1::affine_element decode_affine_le(uint8_t const* p) noexcept
{
    const bool x_is_zero = load_le_u64(p) == 0 && load_le_u64(p + 8) == 0 && load_le_u64(p + 16) == 0 &&
                           load_le_u64(p + 24) == 0;
    const bool y_is_zero = load_le_u64(p + 32) == 0 && load_le_u64(p + 40) == 0 && load_le_u64(p + 48) == 0 &&
                           load_le_u64(p + 56) == 0;
    if (x_is_zero && y_is_zero) {
        return bb::g1::affine_element::infinity();
    }

    bb::numeric::uint256_t x_raw{ load_le_u64(p),
                                  load_le_u64(p + 8),
                                  load_le_u64(p + 16),
                                  load_le_u64(p + 24) };
    bb::numeric::uint256_t y_raw{ load_le_u64(p + 32),
                                  load_le_u64(p + 40),
                                  load_le_u64(p + 48),
                                  load_le_u64(p + 56) };
    // bb::fq(uint256_t) converts to Montgomery internally.
    return bb::g1::affine_element{ bb::fq(x_raw), bb::fq(y_raw) };
}

// Encode a bb::g1::affine_element to 64 LE bytes (x_le || y_le), non-Montgomery.
// Point at infinity -> (0, 0).
static inline void encode_affine_le(const bb::g1::affine_element& p, uint8_t* out) noexcept
{
    if (p.is_point_at_infinity()) {
        std::memset(out, 0, 64);
        return;
    }
    // Convert out of Montgomery form, then reduce to canonical [0, q) representative.
    const bb::fq x_std = p.x.from_montgomery_form_reduced();
    const bb::fq y_std = p.y.from_montgomery_form_reduced();
    store_le_u64(out, x_std.data[0]);
    store_le_u64(out + 8, x_std.data[1]);
    store_le_u64(out + 16, x_std.data[2]);
    store_le_u64(out + 24, x_std.data[3]);
    store_le_u64(out + 32, y_std.data[0]);
    store_le_u64(out + 40, y_std.data[1]);
    store_le_u64(out + 48, y_std.data[2]);
    store_le_u64(out + 56, y_std.data[3]);
}

} // namespace

/**
 * @brief BN254 G1 MSM entry point, pippenger with multi-threaded reduction.
 * @details Deserializes flat LE buffers, runs bb::scalar_multiplication::pippenger
 *          (handle_edge_cases=true — safe variant that tolerates point-at-infinity
 *          and zero scalars, matching arkworks/constantine semantics), and writes
 *          the reduced result back as a flat 64-byte LE affine point.
 */
WASM_EXPORT void pippenger_msm_bn254_bench(uint8_t const* points_bytes,
                                           uint8_t const* scalars_bytes,
                                           uint32_t size,
                                           uint8_t* out_bytes)
{
    using Curve = bb::curve::BN254;
    using AffineElement = Curve::AffineElement;
    using ScalarField = Curve::ScalarField;

    std::vector<AffineElement> points;
    std::vector<ScalarField> scalars;
    points.reserve(size);
    scalars.reserve(size);

    for (uint32_t i = 0; i < size; ++i) {
        points.push_back(decode_affine_le(points_bytes + static_cast<size_t>(i) * 64));
        scalars.push_back(decode_fr_le(scalars_bytes + static_cast<size_t>(i) * 32));
    }

    bb::PolynomialSpan<const ScalarField> scalar_span{ /*start_index=*/0,
                                                       std::span<const ScalarField>{ scalars.data(), scalars.size() } };
    std::span<const AffineElement> point_span{ points.data(), points.size() };

    Curve::Element result =
        bb::scalar_multiplication::pippenger<Curve>(scalar_span, point_span, /*handle_edge_cases=*/true);

    AffineElement result_affine(result);
    encode_affine_le(result_affine, out_bytes);
}

/**
 * @brief BN254 G1 MSM entry point, pippenger with handle_edge_cases=false.
 * @details Identical I/O contract to pippenger_msm_bn254_bench, but passes
 *          handle_edge_cases=false to force the affine batch-inversion path
 *          (MSM<Curve>::affine_pippenger_with_transformed_scalars). Assumes
 *          the input is not pathological (no two points sharing a bucket
 *          triggering P = -Q or P = Q during bucket accumulation). Random
 *          test vectors from harness/public/vectors are safe.
 */
WASM_EXPORT void pippenger_msm_bn254_bench_unsafe(uint8_t const* points_bytes,
                                                  uint8_t const* scalars_bytes,
                                                  uint32_t size,
                                                  uint8_t* out_bytes)
{
    using Curve = bb::curve::BN254;
    using AffineElement = Curve::AffineElement;
    using ScalarField = Curve::ScalarField;

    std::vector<AffineElement> points;
    std::vector<ScalarField> scalars;
    points.reserve(size);
    scalars.reserve(size);

    for (uint32_t i = 0; i < size; ++i) {
        points.push_back(decode_affine_le(points_bytes + static_cast<size_t>(i) * 64));
        scalars.push_back(decode_fr_le(scalars_bytes + static_cast<size_t>(i) * 32));
    }

    bb::PolynomialSpan<const ScalarField> scalar_span{ /*start_index=*/0,
                                                       std::span<const ScalarField>{ scalars.data(), scalars.size() } };
    std::span<const AffineElement> point_span{ points.data(), points.size() };

    Curve::Element result =
        bb::scalar_multiplication::pippenger<Curve>(scalar_span, point_span, /*handle_edge_cases=*/false);

    AffineElement result_affine(result);
    encode_affine_le(result_affine, out_bytes);
}
