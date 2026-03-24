#include "get_bn254_crs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/flock.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "bn254_crs_data.hpp"
#include "bn254_g1_chunk_hashes.hpp"
#include "http_download.hpp"
#include <algorithm>
#include <atomic>
#include <span>

namespace {
// Primary CRS URL (Cloudflare R2) — compressed format (32 bytes/point)
constexpr const char* CRS_PRIMARY_URL = "http://crs.aztec-cdn.foundation/g1_compressed.dat";
// Fallback CRS URL (AWS S3)
constexpr const char* CRS_FALLBACK_URL = "http://crs.aztec-labs.com/g1_compressed.dat";
constexpr size_t COMPRESSED_POINT_SIZE = 32;

/**
 * @brief Round num_points up to the next chunk boundary so every downloaded byte is hash-verified.
 */
size_t round_up_to_chunk_boundary(size_t num_points)
{
    if (num_points >= bb::srs::SRS_TOTAL_POINTS) {
        return bb::srs::SRS_TOTAL_POINTS;
    }
    size_t rounded = ((num_points + bb::srs::SRS_CHUNK_SIZE_POINTS - 1) / bb::srs::SRS_CHUNK_SIZE_POINTS) *
                     bb::srs::SRS_CHUNK_SIZE_POINTS;
    return std::min(rounded, bb::srs::SRS_TOTAL_POINTS);
}

/**
 * @brief Verify downloaded CRS data against embedded SHA-256 chunk hashes.
 *
 * @details Verifies all complete chunks in parallel across available cores with early-exit
 * on first mismatch. Also verifies the partial last chunk (if present) so every downloaded byte
 * is covered. Uses std::span to avoid per-chunk memory allocation.
 */
void verify_bn254_crs_integrity(const std::vector<uint8_t>& data)
{
    size_t num_full_chunks = data.size() / bb::srs::SRS_CHUNK_SIZE_BYTES;
    size_t chunks_to_verify = std::min(num_full_chunks, static_cast<size_t>(bb::srs::SRS_NUM_FULL_CHUNKS));

    // Sentinel value means "no failure found yet"
    const size_t sentinel = bb::srs::SRS_NUM_CHUNKS;
    std::atomic<size_t> failed_chunk{ sentinel };

    // Verify all complete chunks in parallel
    if (chunks_to_verify > 0) {
        bb::parallel_for([&](const bb::ThreadChunk& tc) {
            for (size_t i : tc.range(chunks_to_verify)) {
                // Early exit if another thread already found a mismatch
                if (failed_chunk.load(std::memory_order_relaxed) < sentinel) {
                    return;
                }
                size_t offset = i * bb::srs::SRS_CHUNK_SIZE_BYTES;
                auto chunk = std::span<const uint8_t>(data.data() + offset, bb::srs::SRS_CHUNK_SIZE_BYTES);
                auto hash = bb::crypto::sha256(chunk);
                if (hash != bb::srs::BN254_G1_CHUNK_HASHES[i]) {
                    size_t expected = sentinel;
                    failed_chunk.compare_exchange_strong(expected, i, std::memory_order_relaxed);
                }
            }
        });
    }

    // Verify partial last chunk (e.g. the 32-byte tail of the full CRS)
    size_t tail_offset = chunks_to_verify * bb::srs::SRS_CHUNK_SIZE_BYTES;
    size_t tail_size = data.size() - tail_offset;
    if (tail_size > 0 && chunks_to_verify < bb::srs::SRS_NUM_CHUNKS) {
        auto tail = std::span<const uint8_t>(data.data() + tail_offset, tail_size);
        auto hash = bb::crypto::sha256(tail);
        if (hash != bb::srs::BN254_G1_CHUNK_HASHES[chunks_to_verify]) {
            size_t expected = sentinel;
            failed_chunk.compare_exchange_strong(expected, chunks_to_verify, std::memory_order_relaxed);
        }
    }

    size_t bad = failed_chunk.load();
    if (bad < sentinel) {
        size_t offset = bad * bb::srs::SRS_CHUNK_SIZE_BYTES;
        throw_or_abort("CRS integrity check failed: SHA-256 mismatch at chunk " + std::to_string(bad) + " (bytes " +
                       std::to_string(offset) + "+)");
    }

    vinfo("verified ", chunks_to_verify + (tail_size > 0 ? 1 : 0), " BN254 G1 CRS chunks via SHA-256");
}

/**
 * @brief Download compressed CRS data, verify integrity, decompress, and serialize to uncompressed format.
 *
 * @details Downloads 32 bytes/point (compressed), verifies SHA-256 chunk hashes,
 * then decompresses to 64 bytes/point (uncompressed affine x,y) for on-disk storage.
 * This gives us 50% bandwidth savings while keeping the on-disk format fast to load.
 */
std::vector<uint8_t> download_and_decompress_bn254_g1_data(size_t num_points,
                                                           const std::string& primary_url,
                                                           const std::string& fallback_url)
{
    // Round up to chunk boundary so every downloaded byte is hash-verified
    size_t download_points = round_up_to_chunk_boundary(num_points);
    size_t g1_end = (download_points * COMPRESSED_POINT_SIZE) - 1;

    // Try primary URL first, with fallback on failure.
    // Note: WASM is compiled with -fno-exceptions, so try/catch is not available.
    // In practice, WASM never calls this function - it initializes CRS via srs_init_srs from JavaScript.
    std::vector<uint8_t> compressed_data;
#ifndef __wasm__
    try {
        compressed_data = bb::srs::http_download(primary_url, 0, g1_end);
    } catch (const std::exception& e) {
        vinfo("Primary CRS download failed: ", e.what(), ". Trying fallback...");
        compressed_data = bb::srs::http_download(fallback_url, 0, g1_end);
    }
#else
    // WASM fallback: just try primary (will abort on failure)
    compressed_data = bb::srs::http_download(primary_url, 0, g1_end);
    static_cast<void>(fallback_url);
#endif

    if (compressed_data.size() < COMPRESSED_POINT_SIZE) {
        throw_or_abort("Downloaded g1 data is too small");
    }

    // Quick sanity check: verify the first two G1 points match expected values
    auto first = from_buffer<uint256_t>(compressed_data, 0);
    if (first != bb::srs::BN254_G1_FIRST_ELEMENT_COMPRESSED) {
        throw_or_abort("Downloaded BN254 G1 CRS first element does not match expected point.");
    }

    if (compressed_data.size() >= 2 * COMPRESSED_POINT_SIZE) {
        auto second = from_buffer<uint256_t>(compressed_data, COMPRESSED_POINT_SIZE);
        if (second != bb::srs::BN254_G1_SECOND_ELEMENT_COMPRESSED) {
            throw_or_abort("Downloaded BN254 G1 CRS second element does not match expected point.");
        }
    }

    // Full integrity verification: SHA-256 chunk hashes in parallel
    verify_bn254_crs_integrity(compressed_data);

    // Decompress to affine elements and serialize to uncompressed format (64 bytes/point)
    size_t actual_points = compressed_data.size() / COMPRESSED_POINT_SIZE;
    std::vector<bb::g1::affine_element> points(actual_points);
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(actual_points)) {
            uint256_t c = from_buffer<uint256_t>(compressed_data, i * COMPRESSED_POINT_SIZE);
            points[i] = bb::g1::affine_element::from_compressed(c);
        }
    });

    // Serialize to uncompressed format for on-disk storage
    std::vector<uint8_t> uncompressed_data(actual_points * sizeof(bb::g1::affine_element));
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(actual_points)) {
            auto buf = to_buffer(points[i]);
            std::copy(buf.begin(),
                      buf.end(),
                      uncompressed_data.begin() + static_cast<std::ptrdiff_t>(i * sizeof(bb::g1::affine_element)));
        }
    });

    return uncompressed_data;
}

} // namespace

namespace bb {

// Main implementation with configurable URLs
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download,
                                                  const std::string& primary_url,
                                                  const std::string& fallback_url)
{
    BB_BENCH_NAME("get_bn254_g1_data");
    std::filesystem::create_directories(path);

    auto g1_path = path / "bn254_g1.dat";
    auto lock_path = path / "crs.lock";
    // Acquire exclusive lock to prevent simultaneous downloads
    FileLockGuard lock(lock_path.string());

    // On-disk format is always uncompressed (64 bytes/point)
    size_t g1_file_points = get_file_size(g1_path) / sizeof(g1::affine_element);

    auto deserialize_points = [](const std::vector<uint8_t>& data, size_t n) {
        auto points = std::vector<g1::affine_element>(n);
        parallel_for([&](const ThreadChunk& tc) {
            for (size_t i : tc.range(n)) {
                points[i] = from_buffer<g1::affine_element>(data, i * sizeof(g1::affine_element));
            }
        });
        return points;
    };

    if (g1_file_points >= num_points) {
        vinfo("using cached bn254 crs with ", std::to_string(g1_file_points), " points at ", g1_path);
        auto data = read_file(g1_path, num_points * sizeof(g1::affine_element));
        return deserialize_points(data, num_points);
    }

    if (!allow_download && g1_file_points == 0) {
        throw_or_abort("bn254 g1 data not found at " + g1_path.string() +
                       " and bb does not automatically download in this context." +
                       " Run barretenberg/crs/bootstrap.sh to download.");
    } else if (!allow_download) {
        throw_or_abort(format("bn254 g1 data had ",
                              g1_file_points,
                              " points and ",
                              num_points,
                              " were requested but download not allowed in this context"));
    }

    // Double-check after acquiring lock (another process may have downloaded while we waited)
    g1_file_points = get_file_size(g1_path) / sizeof(g1::affine_element);
    if (g1_file_points >= num_points) {
        auto data = read_file(g1_path, num_points * sizeof(g1::affine_element));
        return deserialize_points(data, num_points);
    }

    // Download compressed, verify, decompress, and store uncompressed on disk
    vinfo("downloading bn254 crs...");
    auto data = download_and_decompress_bn254_g1_data(num_points, primary_url, fallback_url);
    write_file(g1_path, data);
    return deserialize_points(data, num_points);
}

// Default overload using production URLs
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download)
{
    return get_bn254_g1_data(path, num_points, allow_download, CRS_PRIMARY_URL, CRS_FALLBACK_URL);
}

} // namespace bb
