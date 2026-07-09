// Correctness tests for the CUDA MSM backend: every result is compared against the CPU
// Pippenger (`scalar_multiplication::pippenger_unsafe` / `pippenger`), which is the
// reference implementation. All tests skip when no CUDA device is present.

#include "bb_msm_gpu.hpp"

#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/scalar_multiplication/scalar_multiplication.hpp"
#include "barretenberg/numeric/random/engine.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

#include <cstring>
#include <gtest/gtest.h>
#include <vector>

namespace {

namespace gpu = bb::scalar_multiplication::gpu;
using Curve = bb::curve::BN254;
using Fr = Curve::ScalarField;
using AffineElement = Curve::AffineElement;
using Element = Curve::Element;

auto& engine = bb::numeric::get_randomness();

std::vector<AffineElement> random_points(size_t n)
{
    std::vector<AffineElement> points(n);
    for (auto& p : points) {
        p = AffineElement(Element::random_element(&engine));
    }
    return points;
}

std::vector<Fr> random_scalars(size_t n)
{
    std::vector<Fr> scalars(n);
    for (auto& s : scalars) {
        s = Fr::random_element(&engine);
    }
    return scalars;
}

Element cpu_msm(bb::PolynomialSpan<const Fr> scalars, std::span<const AffineElement> points)
{
    return bb::scalar_multiplication::pippenger_unsafe<Curve>(scalars, points);
}

class MsmGpuTest : public ::testing::Test {
  protected:
    void SetUp() override
    {
        if (!gpu::msm_available()) {
            GTEST_SKIP() << "no CUDA device available";
        }
    }
};

} // namespace

TEST_F(MsmGpuTest, OneshotMatchesCpuAcrossSizes)
{
    for (size_t n : { 1UL, 2UL, 127UL, 1UL << 10, 1UL << 16 }) {
        auto points = random_points(n);
        auto scalars = random_scalars(n);
        bb::PolynomialSpan<const Fr> span{ 0, scalars };

        Element expected = cpu_msm(span, points);
        Element result = gpu::pippenger_bn254_oneshot(span, points);
        EXPECT_EQ(result, expected) << "size " << n;
    }
}

TEST_F(MsmGpuTest, ZeroScalars)
{
    const size_t n = 1024;
    auto points = random_points(n);
    auto scalars = random_scalars(n);
    // Sprinkle zeros, including a leading and trailing run.
    for (size_t i = 0; i < 32; i++) {
        scalars[i] = Fr::zero();
        scalars[n - 1 - i] = Fr::zero();
        scalars[engine.get_random_uint32() % n] = Fr::zero();
    }
    bb::PolynomialSpan<const Fr> span{ 0, scalars };
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(span, points), cpu_msm(span, points));
}

TEST_F(MsmGpuTest, AllZeroScalarsIsInfinity)
{
    const size_t n = 256;
    auto points = random_points(n);
    std::vector<Fr> scalars(n, Fr::zero());
    bb::PolynomialSpan<const Fr> span{ 0, scalars };
    Element result = gpu::pippenger_bn254_oneshot(span, points);
    EXPECT_TRUE(result.is_point_at_infinity());
}

TEST_F(MsmGpuTest, DuplicateAndRelatedPoints)
{
    // Duplicate points and P/-P pairs exercise the affine addition edge cases; the CPU
    // reference is the safe pippenger() since the unsafe contract excludes these.
    const size_t n = 512;
    auto points = random_points(n);
    for (size_t i = 0; i < n / 4; i++) {
        points[2 * i + 1] = points[2 * i];
    }
    points[7] = -points[6];
    auto scalars = random_scalars(n);
    bb::PolynomialSpan<const Fr> span{ 0, scalars };

    Element expected = bb::scalar_multiplication::pippenger<Curve>(span, points, /*handle_edge_cases=*/true);
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(span, points), expected);
}

TEST_F(MsmGpuTest, StartIndexOffset)
{
    const size_t n = 2048;
    const size_t start = 173;
    auto points = random_points(n);
    auto scalars = random_scalars(n - start);
    bb::PolynomialSpan<const Fr> span{ start, scalars };

    Element expected = cpu_msm(span, points);
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(span, points), expected);

    // Same span through the resident-context path (which pads leading zeros).
    Element out;
    ASSERT_TRUE(gpu::try_pippenger_bn254(out, span, points));
    EXPECT_EQ(out, expected);
}

TEST_F(MsmGpuTest, ResidentContextReuse)
{
    const size_t n = 1UL << 14;
    auto points = random_points(n);

    // Repeated calls against the same points span must hit the cached resident context
    // and stay correct for varying scalar lengths.
    for (size_t len : { n, n / 2, n / 3, n }) {
        auto scalars = random_scalars(len);
        bb::PolynomialSpan<const Fr> span{ 0, scalars };
        Element out;
        ASSERT_TRUE(gpu::try_pippenger_bn254(out, span, points));
        EXPECT_EQ(out, cpu_msm(span, points)) << "len " << len;
    }
}

TEST_F(MsmGpuTest, CoarseMontgomeryScalarsAreReduced)
{
    // Scalars in bb's coarse representation ([r, 2r)) must give the same result as
    // their canonical form: the GPU wrapper stages a reduced copy.
    const size_t n = 256;
    auto points = random_points(n);
    auto scalars = random_scalars(n);

    std::vector<Fr> coarse = scalars;
    for (auto& s : coarse) {
        // Adding the modulus to the raw limbs leaves the represented value unchanged but
        // produces the non-canonical encoding. Canonical values are < 2^254, so the sum
        // never overflows 256 bits.
        bb::numeric::uint256_t raw{ s.data[0], s.data[1], s.data[2], s.data[3] };
        raw += Fr::modulus;
        s.data[0] = raw.data[0];
        s.data[1] = raw.data[1];
        s.data[2] = raw.data[2];
        s.data[3] = raw.data[3];
    }

    bb::PolynomialSpan<const Fr> canonical_span{ 0, scalars };
    bb::PolynomialSpan<const Fr> coarse_span{ 0, coarse };
    Element expected = cpu_msm(canonical_span, points);
    EXPECT_EQ(gpu::pippenger_bn254_oneshot(coarse_span, points), expected);
}

TEST_F(MsmGpuTest, InputBuffersUntouched)
{
    const size_t n = 1024;
    auto points = random_points(n);
    auto scalars = random_scalars(n);
    auto scalars_copy = scalars;
    auto points_copy = points;

    bb::PolynomialSpan<const Fr> span{ 0, scalars };
    (void)gpu::pippenger_bn254_oneshot(span, points);

    EXPECT_EQ(0, std::memcmp(scalars.data(), scalars_copy.data(), n * sizeof(Fr)));
    EXPECT_EQ(0, std::memcmp(points.data(), points_copy.data(), n * sizeof(AffineElement)));
}
