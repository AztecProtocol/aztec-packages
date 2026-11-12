#include "crs_integrity.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/factories/bn254_g1_chunk_hashes.hpp"
#include "barretenberg/srs/factories/get_bn254_crs.hpp"
#include "barretenberg/srs/factories/grumpkin_crs_data.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include "barretenberg/srs/factories/native_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <gtest/gtest.h>

using namespace bb;
using namespace bb::srs::factories;

namespace {

std::vector<g1::affine_element> canonical_bn254_chunk()
{
    return get_bn254_g1_data(srs::bb_crs_path(), srs::SRS_CHUNK_SIZE_POINTS, /*allow_download=*/false);
}

} // namespace

// The check is cached after the first success, so the points must not be writable through the CRS.
static_assert(std::is_same_v<decltype(std::declval<Crs<curve::BN254>&>().get_monomial_points()),
                             std::span<const g1::affine_element>>);
static_assert(std::is_same_v<decltype(std::declval<Crs<curve::Grumpkin>&>().get_monomial_points()),
                             std::span<const curve::Grumpkin::AffineElement>>);

TEST(CrsIntegrity, Bn254CanonicalChunkVerifies)
{
    MemBn254CrsFactory factory(canonical_bn254_chunk(), srs::get_bn254_g2_crs_element());
    auto crs = factory.get_crs(1);
    EXPECT_NO_THROW(crs->verify_points_integrity());
    EXPECT_NO_THROW(crs->verify_points_integrity());
}

// Every point is on the curve; the chunk hash rejects the one that is not canonical.
TEST(CrsIntegrity, Bn254NonCanonicalPointRejected)
{
    auto points = canonical_bn254_chunk();
    points[2] = g1::affine_element(g1::element(points[0]) * fr(3));
    ASSERT_TRUE(points[2].on_curve());
    MemBn254CrsFactory factory(points, srs::get_bn254_g2_crs_element());
    EXPECT_THROW(factory.get_crs(1)->verify_points_integrity(), std::runtime_error);
}

// The verifier needs no G1 points: its CRS is built from compiled-in constants even where no SRS file exists.
TEST(CrsIntegrity, Bn254VerifierCrsLoadsNoPoints)
{
    NativeBn254CrsFactory factory("barretenberg_srs_test_no_such_directory", /*allow_download=*/false);
    auto crs = factory.get_verifier_crs();
    EXPECT_EQ(crs->get_monomial_size(), 0U);
    EXPECT_EQ(crs->get_g1_identity(), g1::affine_one);
    EXPECT_EQ(crs->get_g2x(), srs::get_bn254_g2_crs_element());
    EXPECT_THROW(crs->verify_points_integrity(), std::runtime_error);
}

// (x, y + 2) keeps the parity of y, so its compressed encoding equals that of the canonical point.
TEST(CrsIntegrity, Bn254OffCurvePointWithCanonicalEncodingRejected)
{
    auto points = canonical_bn254_chunk();
    points[5].y += fq(2);
    ASSERT_EQ(uint256_t(points[5].y).get_bit(0), uint256_t(points[5].y - fq(2)).get_bit(0));
    ASSERT_FALSE(points[5].on_curve());
    EXPECT_THROW(srs::verify_bn254_g1_points(points), std::runtime_error);
}

TEST(CrsIntegrity, Bn254PartialChunkRejected)
{
    auto points = canonical_bn254_chunk();
    EXPECT_THROW(srs::verify_bn254_g1_points({}), std::runtime_error);
    EXPECT_THROW(srs::verify_bn254_g1_points(std::span(points).first(3)), std::runtime_error);
    points.push_back(points[0]);
    EXPECT_THROW(srs::verify_bn254_g1_points(points), std::runtime_error);
}

TEST(CrsIntegrity, GrumpkinCanonicalChunkInstallsAndSwappedPointsRejected)
{
    auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS);
    EXPECT_NO_THROW(MemGrumpkinCrsFactory{ points });
    EXPECT_THROW(srs::verify_grumpkin_g1_points(std::span(points).first(2)), std::runtime_error);
    std::swap(points[1], points[2]);
    EXPECT_THROW(MemGrumpkinCrsFactory{ points }, std::runtime_error);
}
