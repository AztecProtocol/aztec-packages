#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/factories/bn254_g1_chunk_hashes.hpp"
#include "barretenberg/srs/factories/get_bn254_crs.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include "barretenberg/srs/factories/native_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "http_download.hpp"
#include <gtest/gtest.h>
#include <span>
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

    // Use get_bn254_g1_data to load reference points (handles compressed/uncompressed automatically)
    auto g1_points = bb::get_bn254_g1_data(bb::srs::bb_crs_path(), num_points, /*allow_download=*/false);

    // read and verify G2 (SHA-256-pinned + subgroup-checked)
    auto g2_point = bb::get_bn254_g2_data(bb::srs::bb_crs_path());

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
        read_file(bb::srs::bb_crs_path() / "grumpkin_g1_v2.flat.dat", num_points * sizeof(Grumpkin::AffineElement));

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
    fs::remove_all(temp_crs_path);
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
    fs::remove_all(temp_crs_path);
}

// TODO: Re-enable once g1_compressed.dat is deployed to S3 fallback
TEST(CrsFactory, DISABLED_Bn254Fallback)
{
    // Test that fallback works when primary URL fails
    const std::filesystem::path& temp_crs_path = "barretenberg_srs_test_crs_bn254_fallback";
    fs::remove_all(temp_crs_path);
    fs::create_directories(temp_crs_path);

    // Use a bad primary URL that will fail, forcing fallback to the real S3 URL
    std::string bad_primary = "http://nonexistent.invalid/g1_compressed.dat";
    std::string good_fallback = "http://crs.aztec-labs.com/g1_compressed.dat";

    // This should succeed by falling back to the working URL
    auto points = bb::get_bn254_g1_data(temp_crs_path, 1, /*allow_download=*/true, bad_primary, good_fallback);
    EXPECT_EQ(points.size(), 1);
    // Verify the downloaded point matches the expected first element
    EXPECT_EQ(points[0], bb::srs::BN254_G1_FIRST_ELEMENT);

    fs::remove_all(temp_crs_path);
}

// The hardcoded `[x]_2` baked into the BB native binary must be a member of the BN254 G2 prime-order subgroup.
TEST(CrsFactory, Bn254HardcodedG2IsInPrimeSubgroup)
{
    auto g2_point = bb::srs::get_bn254_g2_crs_element();
    ASSERT_TRUE(g2_point.on_curve());
    EXPECT_TRUE(g2_point.is_in_prime_subgroup());
}

// Locks `BN254_G2_ELEMENT_SHA256` to the actual hash of `BN254_G2_ELEMENT_BYTES`. If anyone edits
// the bytes without recomputing the hash (or vice versa), this fails and forces them to fix it.
TEST(CrsFactory, Bn254G2HashMatchesPinnedBytes)
{
    auto hash = bb::crypto::sha256(
        std::span<const uint8_t>(bb::srs::BN254_G2_ELEMENT_BYTES.data(), bb::srs::BN254_G2_ELEMENT_BYTES.size()));
    EXPECT_EQ(hash, bb::srs::BN254_G2_ELEMENT_SHA256);
}

// Round-trip: the on-disk `bn254_g2.dat` provisioned by `barretenberg/crs/bootstrap.sh` must
// match the pinned canonical bytes byte-for-byte and pass subgroup validation. This catches
// corruption, accidental SRS swaps, or an outdated CDN payload.
TEST(CrsFactory, Bn254G2DataLoadsAndVerifies)
{
    auto g2_point = bb::get_bn254_g2_data(bb::srs::bb_crs_path());
    EXPECT_EQ(g2_point, bb::srs::get_bn254_g2_crs_element());
}

// A tampered `bn254_g2.dat` (corrupted single byte) must be rejected by the SHA-256 check.
TEST(CrsFactory, Bn254G2CorruptionDetected)
{
    const std::filesystem::path temp_path = "barretenberg_srs_test_crs_g2_corruption";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);

    auto corrupted =
        std::vector<uint8_t>(bb::srs::BN254_G2_ELEMENT_BYTES.begin(), bb::srs::BN254_G2_ELEMENT_BYTES.end());
    corrupted[64] ^= 0xFF;
    bb::write_file(temp_path / "bn254_g2.dat", corrupted);

    EXPECT_THROW_OR_ABORT(bb::get_bn254_g2_data(temp_path), "SHA-256 mismatch");

    fs::remove_all(temp_path);
}

// Check that a `bn254_g2.dat` containing the point at infinity is rejected, even though it is technically on-curve.
TEST(CrsFactory, Bn254G2InfinityRejected)
{
    const std::filesystem::path temp_path = "barretenberg_srs_test_crs_g2_infinity";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);

    std::vector<uint8_t> infinity_bytes(128, 0xFF);
    bb::write_file(temp_path / "bn254_g2.dat", infinity_bytes);

    EXPECT_THROW_OR_ABORT(bb::get_bn254_g2_data(temp_path), "point at infinity");

    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254CompressedChunkHashFirstChunk)
{
    // Download the first chunk of compressed CRS from CDN and verify its hash.
    // We don't require compressed data on disk; only uncompressed is cached.
    auto data = bb::srs::http_download(
        "http://crs.aztec-cdn.foundation/g1_compressed.dat", 0, bb::srs::SRS_CHUNK_SIZE_BYTES - 1);
    auto chunk = std::span<const uint8_t>(data.data(), data.size());
    auto hash = bb::crypto::sha256(chunk);
    EXPECT_EQ(hash, bb::srs::BN254_G1_CHUNK_HASHES[0]);
}

TEST(CrsFactory, Bn254CompressedChunkHashCorruptionDetected)
{
    // Download compressed data and verify that corruption is detected.
    auto data = bb::srs::http_download(
        "http://crs.aztec-cdn.foundation/g1_compressed.dat", 0, bb::srs::SRS_CHUNK_SIZE_BYTES - 1);

    data[bb::srs::SRS_CHUNK_SIZE_BYTES / 2] ^= 0xFF;
    auto chunk = std::span<const uint8_t>(data.data(), data.size());
    auto hash = bb::crypto::sha256(chunk);
    EXPECT_NE(hash, bb::srs::BN254_G1_CHUNK_HASHES[0]);
}

// With `BB_VERIFY_CRS=1`, `get_bn254_g1_data` runs the chunk-hash check on cached compressed bytes
// and rejects a corrupted file that would otherwise be silently decompressed and trusted.
TEST(CrsFactory, Bn254CacheLoadRejectsCorruptionWhenEnvVarSet)
{
    constexpr size_t COMPRESSED_POINT_SIZE = 32;
    const fs::path temp_path = "barretenberg_srs_test_env_var_corruption";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);

    // Three points: garbage everywhere is fine — the partial-last-chunk SHA-256 check compares
    // against BN254_G1_CHUNK_HASHES[0] (hash of a real 4MB chunk) and necessarily fails.
    std::vector<uint8_t> bad_data(3 * COMPRESSED_POINT_SIZE, 0);
    bb::write_file(temp_path / "bn254_g1_compressed.dat", bad_data);

    setenv("BB_VERIFY_CRS", "1", /*overwrite=*/1);
    EXPECT_THROW_OR_ABORT(bb::get_bn254_g1_data(temp_path, /*num_points=*/3, /*allow_download=*/false),
                          "CRS integrity check failed");
    unsetenv("BB_VERIFY_CRS");

    fs::remove_all(temp_path);
}
