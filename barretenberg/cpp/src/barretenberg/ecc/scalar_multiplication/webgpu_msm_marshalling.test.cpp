#include "webgpu_msm_marshalling.hpp"

#include <cstdint>
#include <vector>

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <gtest/gtest.h>

namespace {

using bb::curve::BN254;
using AffineElement = BN254::AffineElement;
using BaseField = BN254::BaseField;
using ScalarField = BN254::ScalarField;
using bb::numeric::uint256_t;
using namespace bb::scalar_multiplication::webgpu_marshalling;

auto& engine = bb::numeric::get_randomness();

// Round-trip an Fr value through the LE 32-byte non-Montgomery scalar
// layout. The marshal side uses `static_cast<uint256_t>(field)` which
// returns the canonical (non-Montgomery) representation; reading the
// bytes back as a uint256 and reconstructing the scalar must equal the
// original.
TEST(WebGpuMsmMarshalling, ScalarRoundTrip)
{
    constexpr size_t kCount = 64;
    std::vector<ScalarField> scalars;
    scalars.reserve(kCount);
    for (size_t i = 0; i < kCount; ++i) {
        scalars.push_back(ScalarField::random_element(&engine));
    }

    std::vector<uint8_t> bytes = marshal_scalars(scalars);
    ASSERT_EQ(bytes.size(), kCount * 32);

    for (size_t i = 0; i < kCount; ++i) {
        uint256_t round_tripped = read_uint256_le(&bytes[i * 32]);
        ScalarField recovered(round_tripped);
        EXPECT_EQ(recovered, scalars[i]) << "scalar mismatch at index " << i;
    }
}

// Specific bit pattern: Fr(1) marshals to [0x01, 0, 0, ..., 0]. This
// catches the case where the Montgomery-form internal bytes are written
// instead of the canonical form (a regression that would silently break
// every GPU MSM result).
TEST(WebGpuMsmMarshalling, ScalarOneIsLittleEndianOne)
{
    std::vector<ScalarField> scalars = { ScalarField(1) };
    std::vector<uint8_t> bytes = marshal_scalars(scalars);
    ASSERT_EQ(bytes.size(), 32);
    EXPECT_EQ(bytes[0], 0x01);
    for (size_t i = 1; i < 32; ++i) {
        EXPECT_EQ(bytes[i], 0u) << "byte " << i << " should be zero";
    }
}

// Affine point round-trip via the marshal/read pair. The full path:
//   1. Marshal AffineElement → 64 LE bytes (Montgomery stripped)
//   2. Read 64 LE bytes → AffineElement (Montgomery re-wrapped)
// must be the identity for any non-infinity point.
TEST(WebGpuMsmMarshalling, AffineRoundTrip)
{
    constexpr size_t kCount = 32;
    std::vector<AffineElement> points;
    points.reserve(kCount);
    for (size_t i = 0; i < kCount; ++i) {
        points.push_back(AffineElement(BN254::Element::random_element(&engine)));
    }

    std::vector<uint8_t> bytes = marshal_points(points);
    ASSERT_EQ(bytes.size(), kCount * 64);

    for (size_t i = 0; i < kCount; ++i) {
        AffineElement recovered = read_affine_le(&bytes[i * 64]);
        EXPECT_EQ(recovered, points[i]) << "point mismatch at index " << i;
    }
}

// Point-at-infinity is encoded as 64 zero bytes. Verifies the
// short-circuit branch in marshal_points doesn't write garbage.
TEST(WebGpuMsmMarshalling, PointAtInfinityEncodesToZero)
{
    std::vector<AffineElement> points = { AffineElement::infinity() };
    std::vector<uint8_t> bytes = marshal_points(points);
    ASSERT_EQ(bytes.size(), 64);
    for (size_t i = 0; i < 64; ++i) {
        EXPECT_EQ(bytes[i], 0u) << "infinity byte " << i << " should be zero";
    }
}

// 256-bit little-endian round-trip on a known bit pattern. Catches any
// byte-order confusion that affects all the higher-level helpers.
TEST(WebGpuMsmMarshalling, Uint256LittleEndianBytes)
{
    uint256_t u;
    u.data[0] = 0x0807060504030201ULL;
    u.data[1] = 0x100F0E0D0C0B0A09ULL;
    u.data[2] = 0x1817161514131211ULL;
    u.data[3] = 0x201F1E1D1C1B1A19ULL;

    uint8_t bytes[32];
    write_uint256_le(bytes, u);
    for (size_t i = 0; i < 32; ++i) {
        EXPECT_EQ(bytes[i], static_cast<uint8_t>(i + 1));
    }

    uint256_t recovered = read_uint256_le(bytes);
    for (int i = 0; i < 4; ++i) {
        EXPECT_EQ(recovered.data[i], u.data[i]);
    }
}

// combine_windows Horner-folds the per-window sums into the MSM point:
// result = Σ_w L_w · 2^(w·c). Validated against an independent scalar-
// multiplication reference, so an algorithmic bug in the doubling fold (wrong
// doubling count or window order) is caught, not just a byte-layout mismatch.
TEST(WebGpuMsmMarshalling, CombineWindowsHornerFold)
{
    constexpr uint32_t c = 13;
    constexpr uint32_t kNumWindows = 20;

    std::vector<AffineElement> windows;
    windows.reserve(kNumWindows);
    for (uint32_t w = 0; w < kNumWindows; ++w) {
        windows.push_back(AffineElement(BN254::Element::random_element(&engine)));
    }
    const std::vector<uint8_t> buf = marshal_points(windows);
    ASSERT_EQ(buf.size(), static_cast<size_t>(kNumWindows) * 64);

    // Reference: Σ_w windows[w] · 2^(w·c) by scalar multiplication.
    BN254::Element expected = BN254::Element::infinity();
    ScalarField weight(1);
    const ScalarField step(1 << c);
    for (uint32_t w = 0; w < kNumWindows; ++w) {
        expected += BN254::Element(windows[w]) * weight;
        weight *= step;
    }

    EXPECT_EQ(combine_windows(buf.data(), kNumWindows, c), AffineElement(expected));
}

// Boundary cases: zero windows must not dereference the buffer (returns the
// point at infinity); a single window is returned verbatim.
TEST(WebGpuMsmMarshalling, CombineWindowsSingleAndEmpty)
{
    EXPECT_TRUE(combine_windows(nullptr, 0, 13).is_point_at_infinity());

    const AffineElement only(BN254::Element::random_element(&engine));
    const std::vector<AffineElement> single = { only };
    const std::vector<uint8_t> buf = marshal_points(single);
    EXPECT_EQ(combine_windows(buf.data(), 1, 13), only);
}

} // namespace
