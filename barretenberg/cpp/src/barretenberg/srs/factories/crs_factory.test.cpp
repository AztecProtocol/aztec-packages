#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/factories/bn254_crs_hashes.hpp"
#include "barretenberg/srs/factories/get_bn254_crs.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include "barretenberg/srs/factories/native_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <fstream>
#include <gtest/gtest.h>
#include <utility>

using namespace bb;
using namespace bb::srs::factories;
using namespace bb::curve;
namespace fs = std::filesystem;

namespace {
// BN254 consistency checker
void check_bn254_consistency(const fs::path& crs_download_path, size_t num_points, bool allow_download)
{
    NativeBn254CrsFactory file_crs(crs_download_path, allow_download);

    // read G1
    std::vector<g1::affine_element> g1_points(num_points);
    auto g1_buf = read_file(bb::srs::bb_crs_path() / "bn254_g1.dat", num_points * sizeof(g1::affine_element));
    for (size_t i = 0; i < num_points; ++i) {
        g1_points[i] = from_buffer<g1::affine_element>(g1_buf, i * sizeof(g1::affine_element));
    }

    // read G2
    auto g2_buf = read_file(bb::srs::bb_crs_path() / "bn254_g2.dat", sizeof(g2::affine_element));
    auto g2_point = from_buffer<g2::affine_element>(g2_buf);

    // build in-memory CRS
    MemBn254CrsFactory mem_crs(g1_points, g2_point);

    // prover CRS
    auto f_prover = file_crs.get_crs(num_points);
    auto m_prover = mem_crs.get_crs(num_points);
    EXPECT_EQ(m_prover->get_monomial_size(), f_prover->get_monomial_size());
    for (size_t i = 0; i < num_points; ++i) {
        EXPECT_EQ(std::make_pair(i, m_prover->get_monomial_points()[i]),
                  std::make_pair(i, f_prover->get_monomial_points()[i]));
    }
    // verifier CRS
    auto f_ver = file_crs.get_verifier_crs();
    auto m_ver = mem_crs.get_verifier_crs();
    EXPECT_EQ(m_ver->get_g2x(), f_ver->get_g2x());
    EXPECT_EQ(0,
              memcmp(m_ver->get_precomputed_g2_lines(),
                     f_ver->get_precomputed_g2_lines(),
                     sizeof(pairing::miller_lines) * 2));
}

// Grumpkin consistency checker
void check_grumpkin_consistency(const fs::path& crs_download_path, size_t num_points, bool allow_download)
{
    NativeGrumpkinCrsFactory file_crs(crs_download_path, allow_download);

    // read G1
    std::vector<Grumpkin::AffineElement> points(num_points);
    auto data =
        read_file(bb::srs::bb_crs_path() / "grumpkin_g1.flat.dat", num_points * sizeof(Grumpkin::AffineElement));

    for (size_t i = 0; i < num_points; ++i) {
        points[i] = from_buffer<Grumpkin::AffineElement>(data, i * sizeof(g1::affine_element));
    }
    MemGrumpkinCrsFactory mem_crs(points);

    // prover CRS
    auto f_prover = file_crs.get_crs(num_points);
    auto m_prover = mem_crs.get_crs(num_points);
    EXPECT_EQ(m_prover->get_monomial_size(), f_prover->get_monomial_size());
    for (size_t i = 0; i < num_points; ++i) {
        EXPECT_EQ(std::make_pair(i, m_prover->get_monomial_points()[i]),
                  std::make_pair(i, f_prover->get_monomial_points()[i]));
    }
}
} // namespace

TEST(CrsFactory, bn254)
{
    check_bn254_consistency(bb::srs::bb_crs_path(), 1024, /*allow_download=*/false);
    const std::filesystem::path& temp_crs_path = "barretenberg_srs_test_crs_bn254";
    fs::remove_all(temp_crs_path);
    fs::create_directories(temp_crs_path);
    // Tiny download check to test the 'net CRS' path
    ASSERT_ANY_THROW(check_bn254_consistency(temp_crs_path, 1, /*allow_download=*/false));
    check_bn254_consistency(temp_crs_path, 1, /*allow_download=*/true);
}

TEST(CrsFactory, grumpkin)
{
    check_grumpkin_consistency(bb::srs::bb_crs_path(), 1024, /*allow_download=*/false);
    const std::filesystem::path& temp_crs_path = "barretenberg_srs_test_crs_grumpkin";
    fs::remove_all(temp_crs_path);
    fs::create_directories(temp_crs_path);
    // Tiny download check to test the 'net CRS' path
    ASSERT_ANY_THROW(check_grumpkin_consistency(temp_crs_path, 1, /*allow_download=*/false));
    check_grumpkin_consistency(temp_crs_path, 1, /*allow_download=*/true);
}

TEST(CrsFactory, Bn254Fallback)
{
    // Test that fallback works when primary URL fails
    const std::filesystem::path& temp_crs_path = "barretenberg_srs_test_crs_bn254_fallback";
    fs::remove_all(temp_crs_path);
    fs::create_directories(temp_crs_path);

    // Use a bad primary URL that will fail, forcing fallback to the real S3 URL
    std::string bad_primary = "http://nonexistent.invalid/g1.dat";
    std::string good_fallback = "http://crs.aztec-labs.com/g1.dat";

    // This should succeed by falling back to the working URL
    auto points = bb::get_bn254_g1_data(temp_crs_path, 1, /*allow_download=*/true, bad_primary, good_fallback);
    EXPECT_EQ(points.size(), 1);
    // Verify the downloaded point matches the expected first element
    EXPECT_EQ(points[0], bb::srs::BN254_G1_FIRST_ELEMENT);

    fs::remove_all(temp_crs_path);
}

TEST(CrsFactory, Bn254HashVerification)
{
    // Test that SHA256 chunk hash verification works on network downloads.
    // Request a non-aligned number of points — the download should round up to
    // 2 full 8MB chunks (262144 points = 16MB) so every chunk is fully verified.
    const size_t requested_points = 200000;
    const size_t points_per_chunk = bb::srs::CRS_HASH_CHUNK_SIZE / sizeof(g1::affine_element); // 131072
    const size_t expected_cached_points = 2 * points_per_chunk;                                 // 262144
    const std::filesystem::path& temp_crs_path = "barretenberg_srs_test_crs_bn254_hash";
    fs::remove_all(temp_crs_path);
    fs::create_directories(temp_crs_path);

    auto points = bb::get_bn254_g1_data(temp_crs_path, requested_points, /*allow_download=*/true);
    EXPECT_EQ(points.size(), requested_points);
    EXPECT_EQ(points[0], bb::srs::BN254_G1_FIRST_ELEMENT);

    // The cached file should be rounded up to 8MB boundary
    size_t cached_size = get_file_size(temp_crs_path / "bn254_g1.dat");
    EXPECT_EQ(cached_size, expected_cached_points * sizeof(g1::affine_element));

    // Read back and verify hashes pass
    auto data = read_file(temp_crs_path / "bn254_g1.dat", cached_size);
    EXPECT_NO_THROW(bb::srs::verify_bn254_crs_integrity(data));

    // Corrupt a byte in the second chunk and verify that hash check catches it
    data[bb::srs::CRS_HASH_CHUNK_SIZE + 100] ^= 0xFF;
    EXPECT_ANY_THROW(bb::srs::verify_bn254_crs_integrity(data));

    fs::remove_all(temp_crs_path);
}
