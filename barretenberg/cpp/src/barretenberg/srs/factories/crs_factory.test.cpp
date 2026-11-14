#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/pairing.hpp"
#include "barretenberg/polynomials/backing_memory.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/factories/bn254_g1_chunk_hashes.hpp"
#include "barretenberg/srs/factories/get_bn254_crs.hpp"
#include "barretenberg/srs/factories/get_grumpkin_crs.hpp"
#include "barretenberg/srs/factories/grumpkin_crs_data.hpp"
#include "barretenberg/srs/factories/grumpkin_srs_gen.hpp"
#include "barretenberg/srs/factories/mem_bn254_crs_factory.hpp"
#include "barretenberg/srs/factories/mem_grumpkin_crs_factory.hpp"
#include "barretenberg/srs/factories/native_crs_factory.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include "http_download.hpp"
#include <chrono>
#include <cstring>
#include <fstream>
#include <gtest/gtest.h>
#include <span>
#include <sys/stat.h>
#include <thread>
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

    // read G1: an in-memory CRS is built from whole pinned chunks
    const size_t chunk = bb::srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS;
    const size_t load_points = ((num_points + chunk - 1) / chunk) * chunk;
    std::vector<Grumpkin::AffineElement> points(load_points);
    auto data =
        read_file(bb::srs::bb_crs_path() / "grumpkin_g1_v2.flat.dat", load_points * sizeof(Grumpkin::AffineElement));

    for (size_t i = 0; i < load_points; ++i) {
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
    // A fixture holding the first chunk of the user's CRS, so that in low memory mode the factory writes its native
    // cache there and never into the shared CRS directory. Loads are rounded up to whole chunks.
    const fs::path fixture_path = "barretenberg_srs_test_crs_bn254_fixture";
    fs::remove_all(fixture_path);
    fs::create_directories(fixture_path);
    bb::write_file(fixture_path / "bn254_g1.dat",
                   bb::read_file(bb::srs::bb_crs_path() / "bn254_g1.dat",
                                 bb::srs::SRS_CHUNK_SIZE_POINTS * sizeof(g1::affine_element)));
    check_bn254_consistency(fixture_path, 1024, /*allow_download=*/false);
    fs::remove_all(fixture_path);

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

// Gates that bootstrap.sh produced the canonical file: every chunk matches GRUMPKIN_G1_CHUNK_HASHES.
TEST(CrsFactory, GrumpkinG1OnDiskMatchesChunkHashes)
{
    auto data = bb::read_file(bb::srs::bb_crs_path() / "grumpkin_g1_v2.flat.dat", bb::srs::GRUMPKIN_G1_SIZE_BYTES);
    ASSERT_EQ(data.size(), bb::srs::GRUMPKIN_G1_SIZE_BYTES);
    bb::verify_grumpkin_crs_integrity(std::span<const uint8_t>(data.data(), data.size()));
}

// Gates that the generator output still matches GRUMPKIN_G1_CHUNK_HASHES (i.e. the seed-derived SRS
// hasn't drifted). Fails if the SRS is regenerated, in which case update the chunk hashes.
TEST(CrsFactory, GrumpkinG1GeneratorMatchesChunkHashes)
{
    auto points = bb::srs::generate_grumpkin_srs(bb::srs::GRUMPKIN_G1_NUM_POINTS);
    auto bytes = to_buffer(points);
    ASSERT_EQ(bytes.size(), bb::srs::GRUMPKIN_G1_SIZE_BYTES);
    bb::verify_grumpkin_crs_integrity(std::span<const uint8_t>(bytes.data(), bytes.size()));
}

// Plant a one-chunk cache of `[1·G, 2·G, …]` (known pairwise discrete logs → IPA binding break).
// The on-curve check accepts it; the chunk-hash anchor rejects it.
TEST(CrsFactory, GrumpkinCacheTamperingRejected)
{
    using AffineEl = bb::curve::Grumpkin::AffineElement;

    const fs::path cache_path = "barretenberg_srs_test_crs_grumpkin_tamper";
    fs::remove_all(cache_path);
    fs::create_directories(cache_path);

    std::vector<AffineEl> tampered(bb::srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS);
    AffineEl G = AffineEl::one();
    for (size_t i = 0; i < tampered.size(); ++i) {
        bb::curve::Grumpkin::ScalarField scalar(i + 1);
        tampered[i] = AffineEl(bb::curve::Grumpkin::Element(G) * scalar);
    }
    bb::write_file(cache_path / "grumpkin_g1_v2.flat.dat", to_buffer(tampered));

    NativeGrumpkinCrsFactory factory(cache_path, /*allow_download=*/false);
    ASSERT_ANY_THROW(factory.get_crs(8));

    fs::remove_all(cache_path);
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
    bb::write_file(temp_path / "bn254_g1.dat", to_buffer(std::vector<g1::affine_element>(3, g1::affine_one)));

    setenv("BB_VERIFY_CRS", "1", /*overwrite=*/1);
    EXPECT_THROW_OR_ABORT(bb::get_bn254_g1_data(temp_path, /*num_points=*/3, /*allow_download=*/false),
                          "CRS integrity check failed");
    unsetenv("BB_VERIFY_CRS");

    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254VerifiedCacheSupportsSmallRequests)
{
    const fs::path temp_path = "barretenberg_srs_test_verified_prefix";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    const auto data = bb::srs::http_download(
        "http://crs.aztec-cdn.foundation/g1_compressed.dat", 0, bb::srs::SRS_CHUNK_SIZE_BYTES - 1);
    bb::write_file(temp_path / "bn254_g1_compressed.dat", data);
    bb::write_file(temp_path / "bn254_g1.dat", to_buffer(std::vector<g1::affine_element>(3, -g1::affine_one)));
    setenv("BB_VERIFY_CRS", "1", 1);
    EXPECT_NO_THROW({
        const auto points = bb::get_bn254_g1_data(temp_path, 3, false);
        EXPECT_EQ(points.size(), bb::srs::SRS_CHUNK_SIZE_POINTS);
        EXPECT_EQ(points[0], g1::affine_one);
        fs::remove(temp_path / "bn254_g1.dat");
        EXPECT_EQ(bb::get_bn254_g1_data(temp_path, 3, false)[0], g1::affine_one);
    });
    unsetenv("BB_VERIFY_CRS");
    fs::remove_all(temp_path);
}

TEST(CrsFactory, GrumpkinIntegrityRejectsUncoveredBytes)
{
    EXPECT_THROW(verify_grumpkin_crs_integrity({}), std::runtime_error);
    const auto points = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_NUM_POINTS);
    auto bytes = to_buffer(points);
    EXPECT_NO_THROW(verify_grumpkin_crs_integrity(bytes));
    EXPECT_THROW(verify_grumpkin_crs_integrity(std::span(bytes).first(2 * sizeof(Grumpkin::AffineElement))),
                 std::runtime_error);
    EXPECT_THROW(verify_grumpkin_crs_integrity(std::span(bytes).first(srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES + 64)),
                 std::runtime_error);
    for (size_t chunk = 0; chunk < srs::GRUMPKIN_G1_NUM_CHUNKS; ++chunk) {
        auto corrupted = bytes;
        corrupted[chunk * srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES + 64] ^= 1;
        EXPECT_THROW(verify_grumpkin_crs_integrity(corrupted), std::runtime_error);
    }
    bytes.resize(bytes.size() + srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES);
    EXPECT_THROW(verify_grumpkin_crs_integrity(bytes), std::runtime_error);
}

TEST(CrsFactory, GrumpkinShortCacheCannotBypassIntegrity)
{
    const fs::path cache_path = "barretenberg_srs_test_crs_grumpkin_short";
    fs::remove_all(cache_path);
    fs::create_directories(cache_path);
    auto points = srs::generate_grumpkin_srs(2);
    points[1] = points[0];
    write_file(cache_path / "grumpkin_g1_v2.flat.dat", to_buffer(points));
    EXPECT_THROW(get_grumpkin_g1_data(cache_path, 2, /*allow_download=*/false), std::runtime_error);
    EXPECT_EQ(get_grumpkin_g1_data(cache_path, 2, /*allow_download=*/true),
              srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS));
    fs::remove_all(cache_path);
}

TEST(CrsFactory, GrumpkinGeneratedCacheCoversWholeChunks)
{
    const fs::path cache_path = "barretenberg_srs_test_crs_grumpkin_generated";
    fs::remove_all(cache_path);
    const auto expected = srs::generate_grumpkin_srs(srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS);
    EXPECT_EQ(get_grumpkin_g1_data(cache_path, 2, /*allow_download=*/true), expected);
    EXPECT_EQ(fs::file_size(cache_path / "grumpkin_g1_v2.flat.dat"), srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES);
    EXPECT_EQ(get_grumpkin_g1_data(cache_path, 2, /*allow_download=*/false), expected);
    fs::remove_all(cache_path);
}

#if !defined(__wasm__) && !defined(_WIN32)
namespace {
// Loads are rounded up to whole chunks, so the fixture is two chunks and the smaller request is one.
constexpr size_t NATIVE_CACHE_SMALL_POINTS = bb::srs::SRS_CHUNK_SIZE_POINTS;
constexpr size_t NATIVE_CACHE_TEST_POINTS = 2 * NATIVE_CACHE_SMALL_POINTS;

// Sets slow_low_memory for one test. The native cache is only used in low memory mode.
class SlowLowMemoryScope {
  public:
    explicit SlowLowMemoryScope(bool enabled)
        : saved_(slow_low_memory)
    {
        slow_low_memory = enabled;
    }
    ~SlowLowMemoryScope() { slow_low_memory = saved_; }
    SlowLowMemoryScope(const SlowLowMemoryScope&) = delete;
    SlowLowMemoryScope& operator=(const SlowLowMemoryScope&) = delete;

  private:
    bool saved_;
};

std::vector<g1::affine_element> native_cache_test_points()
{
    auto points = bb::get_bn254_g1_data(bb::srs::bb_crs_path(), NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);
    points[2] = g1::affine_element::infinity();
    return points;
}

void write_uncompressed_source(const fs::path& dir, const std::vector<g1::affine_element>& points)
{
    std::vector<uint8_t> bytes;
    for (const auto& point : points) {
        auto serialized = to_buffer(point);
        bytes.insert(bytes.end(), serialized.begin(), serialized.end());
    }
    bb::write_file(dir / "bn254_g1.dat", bytes);
}

int64_t posix_mtime_ns(const fs::path& path)
{
    struct stat st{};
    EXPECT_EQ(stat(path.c_str(), &st), 0);
#if defined(__APPLE__)
    return static_cast<int64_t>(st.st_mtimespec.tv_sec) * 1'000'000'000 + st.st_mtimespec.tv_nsec;
#else
    return static_cast<int64_t>(st.st_mtim.tv_sec) * 1'000'000'000 + st.st_mtim.tv_nsec;
#endif
}

ino_t inode_of(const fs::path& path)
{
    struct stat st{};
    EXPECT_EQ(stat(path.c_str(), &st), 0);
    return st.st_ino;
}

// Header field offsets in bn254_g1.native.dat.
constexpr size_t HEADER_VERSION_OFFSET = 8;
constexpr size_t HEADER_SOURCE_MTIME_OFFSET = 40;

int64_t header_source_mtime_ns(const fs::path& cache_path)
{
    const auto bytes = bb::read_file(cache_path, sizeof(g1::affine_element));
    int64_t mtime_ns = 0;
    std::memcpy(&mtime_ns, bytes.data() + HEADER_SOURCE_MTIME_OFFSET, sizeof(mtime_ns));
    return mtime_ns;
}

size_t cached_point_count(const fs::path& cache_path)
{
    return fs::file_size(cache_path) / sizeof(g1::affine_element) - 1;
}

void expect_points_eq(std::span<const g1::affine_element> actual, const std::vector<g1::affine_element>& expected)
{
    ASSERT_EQ(actual.size(), expected.size());
    for (size_t i = 0; i < expected.size(); ++i) {
        EXPECT_EQ(std::make_pair(i, actual[i]), std::make_pair(i, expected[i]));
    }
}
} // namespace

/**
 * @brief Outside low memory mode the points are decoded onto the heap and no native cache is written or read.
 */
TEST(CrsFactory, Bn254OrdinaryModeKeepsPointsOnTheHeap)
{
    const SlowLowMemoryScope ordinary_mode(false);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_ordinary_mode";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    const auto points = native_cache_test_points();
    write_uncompressed_source(temp_path, points);

    expect_points_eq(bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false).points,
                     points);
    EXPECT_FALSE(fs::exists(temp_path / "bn254_g1.native.dat"));
    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254NativeCacheRoundTrip)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_round_trip";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    const auto points = native_cache_test_points();
    write_uncompressed_source(temp_path, points);

    const auto decoded = bb::get_bn254_g1_data(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);
    expect_points_eq(decoded, points);
    EXPECT_TRUE(decoded[2].is_point_at_infinity());

    const auto written = bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);
    expect_points_eq(written.points, decoded);
    const auto cache_path = temp_path / "bn254_g1.native.dat";
    EXPECT_EQ(fs::file_size(cache_path), (NATIVE_CACHE_TEST_POINTS + 1) * sizeof(g1::affine_element));

    // A request for fewer points than a chunk maps the whole first chunk.
    const auto mapped = bb::load_bn254_g1_points(temp_path, /*num_points=*/16, /*allow_download=*/false);
    expect_points_eq(mapped.points,
                     std::vector<g1::affine_element>(decoded.begin(), decoded.begin() + NATIVE_CACHE_SMALL_POINTS));
    EXPECT_TRUE(mapped.points[2].is_point_at_infinity());

    // The points are a shared mapping of the cache file: a write to the file shows through the span.
    {
        std::fstream cache(cache_path, std::ios::in | std::ios::out | std::ios::binary);
        cache.seekp(static_cast<std::streamoff>((1 + 5) * sizeof(g1::affine_element)));
        cache.write(reinterpret_cast<const char*>(&decoded[6]), sizeof(g1::affine_element));
    }
    EXPECT_EQ(mapped.points[5], decoded[6]);

    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254NativeCacheRegeneratedOnHeaderMismatch)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_header";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    const auto points = native_cache_test_points();
    write_uncompressed_source(temp_path, points);
    bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);

    const auto cache_path = temp_path / "bn254_g1.native.dat";
    const auto original = bb::read_file(cache_path);
    // Header offsets: magic, version, point_size, endian marker, num_points.
    for (size_t offset : { 0UL, 8UL, 12UL, 16UL, 24UL }) {
        auto corrupted = original;
        corrupted[offset] ^= 0x01;
        bb::write_file(cache_path, corrupted);
        const auto loaded = bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);
        expect_points_eq(loaded.points, points);
        EXPECT_EQ(bb::read_file(cache_path), original) << "cache not regenerated after corrupting byte " << offset;
    }

    // A truncated cache is rejected and rewritten.
    bb::write_file(cache_path, std::span<const uint8_t>(original.data(), original.size() - 1));
    expect_points_eq(bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, false).points, points);
    EXPECT_EQ(bb::read_file(cache_path), original);

    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254NativeCacheFollowsRefreshedSource)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_source";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    auto points = native_cache_test_points();
    write_uncompressed_source(temp_path, points);
    bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);

    std::swap(points[3], points[4]);
    write_uncompressed_source(temp_path, points);
    const auto source_path = temp_path / "bn254_g1.dat";
    fs::last_write_time(source_path, fs::last_write_time(source_path) + std::chrono::seconds(1));
    expect_points_eq(bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, false).points, points);

    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254NativeCacheGrowsWithRequest)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_grow";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    const auto points = native_cache_test_points();
    write_uncompressed_source(temp_path, points);
    const auto cache_path = temp_path / "bn254_g1.native.dat";

    const std::vector<g1::affine_element> prefix(points.begin(), points.begin() + NATIVE_CACHE_SMALL_POINTS);
    expect_points_eq(bb::load_bn254_g1_points(temp_path, prefix.size(), false).points, prefix);
    EXPECT_EQ(fs::file_size(cache_path), (prefix.size() + 1) * sizeof(g1::affine_element));

    expect_points_eq(bb::load_bn254_g1_points(temp_path, points.size(), false).points, points);
    EXPECT_EQ(fs::file_size(cache_path), (points.size() + 1) * sizeof(g1::affine_element));

    fs::remove_all(temp_path);
}
// The source stamp is the POSIX modification time, which every toolchain reads the same way; std::filesystem's
// file_clock epoch differs between libstdc++ and libc++, so a stamp taken from it makes binaries built against one
// treat the other's cache as stale.
TEST(CrsFactory, Bn254NativeCacheStampIsToolchainIndependent)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_stamp";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    write_uncompressed_source(temp_path, native_cache_test_points());
    bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);
    EXPECT_EQ(header_source_mtime_ns(temp_path / "bn254_g1.native.dat"), posix_mtime_ns(temp_path / "bn254_g1.dat"));
    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254NativeCacheLegacyEpochStampIsStaleOnce)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_legacy_stamp";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    const auto points = native_cache_test_points();
    write_uncompressed_source(temp_path, points);
    bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);

    // Rewrite the stamp as libstdc++'s file_clock reports it: its epoch is 2174-01-01, 6437664000 s after Unix's.
    const auto cache_path = temp_path / "bn254_g1.native.dat";
    auto bytes = bb::read_file(cache_path);
    const int64_t legacy_ns = posix_mtime_ns(temp_path / "bn254_g1.dat") - 6'437'664'000LL * 1'000'000'000LL;
    std::memcpy(bytes.data() + HEADER_SOURCE_MTIME_OFFSET, &legacy_ns, sizeof(legacy_ns));
    bb::write_file(cache_path, bytes);
    const ino_t legacy_inode = inode_of(cache_path);

    expect_points_eq(bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, false).points, points);
    const ino_t regenerated_inode = inode_of(cache_path);
    EXPECT_NE(regenerated_inode, legacy_inode);
    for (size_t i = 0; i < 3; ++i) {
        expect_points_eq(bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, false).points, points);
        EXPECT_EQ(inode_of(cache_path), regenerated_inode) << "cache rewritten again on load " << i;
    }
    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254NativeCacheNeverShrinks)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const fs::path temp_path = "barretenberg_srs_test_native_cache_shrink";
    fs::remove_all(temp_path);
    fs::create_directories(temp_path);
    const auto points = native_cache_test_points();
    write_uncompressed_source(temp_path, points);
    const auto cache_path = temp_path / "bn254_g1.native.dat";
    bb::load_bn254_g1_points(temp_path, NATIVE_CACHE_TEST_POINTS, /*allow_download=*/false);

    // A smaller request against a stale cache regenerates it at the size it had, not the size requested.
    const auto source_path = temp_path / "bn254_g1.dat";
    fs::last_write_time(source_path, fs::last_write_time(source_path) + std::chrono::seconds(1));
    const std::vector<g1::affine_element> prefix(points.begin(), points.begin() + NATIVE_CACHE_SMALL_POINTS);
    expect_points_eq(bb::load_bn254_g1_points(temp_path, prefix.size(), false).points, prefix);
    EXPECT_EQ(cached_point_count(cache_path), points.size());
    EXPECT_EQ(header_source_mtime_ns(cache_path), posix_mtime_ns(source_path));

    // Nor does a cache left by an older format version.
    auto bytes = bb::read_file(cache_path);
    const uint32_t old_version = 1;
    std::memcpy(bytes.data() + HEADER_VERSION_OFFSET, &old_version, sizeof(old_version));
    bb::write_file(cache_path, bytes);
    expect_points_eq(bb::load_bn254_g1_points(temp_path, prefix.size(), false).points, prefix);
    EXPECT_EQ(cached_point_count(cache_path), points.size());
    fs::remove_all(temp_path);
}

TEST(CrsFactory, Bn254NativeCacheConcurrentRequestsKeepTheLargest)
{
    const SlowLowMemoryScope low_memory_mode(true);
    const auto points = native_cache_test_points();
    const std::vector<g1::affine_element> prefix(points.begin(), points.begin() + NATIVE_CACHE_SMALL_POINTS);
    for (size_t trial = 0; trial < 8; ++trial) {
        const fs::path temp_path = "barretenberg_srs_test_native_cache_concurrent";
        fs::remove_all(temp_path);
        fs::create_directories(temp_path);
        write_uncompressed_source(temp_path, points);
        bb::Bn254G1Points large;
        bb::Bn254G1Points small;
        std::thread large_thread([&] { large = bb::load_bn254_g1_points(temp_path, points.size(), false); });
        std::thread small_thread([&] { small = bb::load_bn254_g1_points(temp_path, prefix.size(), false); });
        large_thread.join();
        small_thread.join();
        expect_points_eq(large.points, points);
        expect_points_eq(small.points, prefix);
        EXPECT_EQ(cached_point_count(temp_path / "bn254_g1.native.dat"), points.size()) << "trial " << trial;
        fs::remove_all(temp_path);
    }
}
#endif
