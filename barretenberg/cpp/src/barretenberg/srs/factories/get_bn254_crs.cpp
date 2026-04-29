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
#include <atomic>
#include <span>

namespace {
// Primary CRS URL (Cloudflare R2)
constexpr const char* CRS_PRIMARY_URL = "http://crs.aztec-cdn.foundation/g1_compressed.dat";
// Fallback CRS URL (AWS S3)
constexpr const char* CRS_FALLBACK_URL = "http://crs.aztec-labs.com/g1_compressed.dat";
constexpr size_t COMPRESSED_POINT_SIZE = 32;
constexpr size_t UNCOMPRESSED_POINT_SIZE = 64; // sizeof(g1::affine_element)

/**
 * @brief Write decompressed G1 points to a file in uncompressed format (64 bytes each).
 */
void write_uncompressed_g1_points(const std::vector<bb::g1::affine_element>& points, const std::filesystem::path& path)
{
    std::vector<uint8_t> buf(points.size() * UNCOMPRESSED_POINT_SIZE);
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(points.size())) {
            auto serialized = to_buffer(points[i]);
            std::copy(serialized.begin(), serialized.end(), &buf[i * UNCOMPRESSED_POINT_SIZE]);
        }
    });
    bb::write_file(path, buf);
}

/**
 * @brief Read uncompressed G1 points (64 bytes each) from a file.
 */
std::vector<bb::g1::affine_element> read_uncompressed_g1_points(const std::filesystem::path& path, size_t num_points)
{
    auto data = bb::read_file(path, num_points * UNCOMPRESSED_POINT_SIZE);
    std::vector<bb::g1::affine_element> points(num_points);
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(num_points)) {
            points[i] = from_buffer<bb::g1::affine_element>(data, i * UNCOMPRESSED_POINT_SIZE);
        }
    });
    return points;
}

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
 *
 * @note Intentionally invoked from a single site — `download_bn254_g1_data` below — and not from
 * the cache-hit, MemBn254Crs ctor, or `bbapi::SrsInitSrs` paths. This is the only path that
 * (a) fetches CRS bytes over plain HTTP, and (b) does not consume bytes that have already been
 * hash-verified upstream:
 *   - the cache-hit paths (uncompressed and compressed) read bytes that were verified by this
 *     function on a previous run before being cached;
 *   - `bbapi::SrsInitSrs` (bb.js / WASM) receives bytes that bb.js itself fetched over HTTPS,
 *     where TLS provides transport integrity;
 *   - `MemBn254Crs` is constructed in-process from already-validated points.
 * Therefore re-anchoring at every additional call site is redundant; this anchor exists
 * specifically to compensate for the plain-HTTP fetch on the fresh-download path.
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
 * @brief Decompress a buffer of compressed G1 points (32 bytes each) into affine elements.
 */
std::vector<bb::g1::affine_element> decompress_g1_points(const std::vector<uint8_t>& data, size_t num_points)
{
    std::vector<bb::g1::affine_element> points(num_points);
    bb::parallel_for([&](bb::ThreadChunk chunk) {
        for (auto i : chunk.range(num_points)) {
            uint256_t compressed = from_buffer<uint256_t>(data, i * COMPRESSED_POINT_SIZE);
            points[i] = bb::g1::affine_element::from_compressed(compressed);
        }
    });
    return points;
}

std::vector<uint8_t> download_bn254_g1_data(size_t num_points,
                                            const std::string& primary_url,
                                            const std::string& fallback_url)
{
    // Round up to chunk boundary so every downloaded byte is hash-verified
    size_t download_points = round_up_to_chunk_boundary(num_points);
    size_t g1_end = (download_points * COMPRESSED_POINT_SIZE) - 1;

    // Try primary URL first, with fallback on failure.
    // Note: WASM is compiled with -fno-exceptions, so try/catch is not available.
    // In practice, WASM never calls this function - it initializes CRS via srs_init_srs from JavaScript.
    std::vector<uint8_t> data;
#ifndef __wasm__
    try {
        data = bb::srs::http_download(primary_url, 0, g1_end);
    } catch (const std::exception& e) {
        vinfo("Primary CRS download failed: ", e.what(), ". Trying fallback...");
        data = bb::srs::http_download(fallback_url, 0, g1_end);
    }
#else
    // WASM fallback: just try primary (will abort on failure)
    data = bb::srs::http_download(primary_url, 0, g1_end);
    static_cast<void>(fallback_url);
#endif

    if (data.size() < COMPRESSED_POINT_SIZE) {
        throw_or_abort("Downloaded g1 data is too small");
    }

    // Quick sanity check: verify the first two G1 points match expected values
    auto first = from_buffer<uint256_t>(data, 0);
    if (first != bb::srs::BN254_G1_FIRST_ELEMENT_COMPRESSED) {
        throw_or_abort("Downloaded BN254 G1 CRS first element does not match expected point.");
    }

    if (data.size() >= 2 * COMPRESSED_POINT_SIZE) {
        auto second = from_buffer<uint256_t>(data, COMPRESSED_POINT_SIZE);
        if (second != bb::srs::BN254_G1_SECOND_ELEMENT_COMPRESSED) {
            throw_or_abort("Downloaded BN254 G1 CRS second element does not match expected point.");
        }
    }

    // Full integrity verification: SHA-256 chunk hashes in parallel
    verify_bn254_crs_integrity(data);

    return data;
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

    auto uncompressed_path = path / "bn254_g1.dat";
    auto compressed_path = path / "bn254_g1_compressed.dat";
    auto lock_path = path / "crs.lock";
    // Acquire exclusive lock to prevent simultaneous downloads
    FileLockGuard lock(lock_path.string());

    // 1. Prefer cached uncompressed (fastest: parallel from_buffer, ~0.3s for 2^20 points)
    size_t uncompressed_points = get_file_size(uncompressed_path) / UNCOMPRESSED_POINT_SIZE;
    if (uncompressed_points >= num_points) {
        vinfo("using cached uncompressed bn254 crs with ", uncompressed_points, " points at ", uncompressed_path);
        return read_uncompressed_g1_points(uncompressed_path, num_points);
    }

    // 2. Fall back to compressed on disk: decompress and cache uncompressed
    size_t compressed_points = get_file_size(compressed_path) / COMPRESSED_POINT_SIZE;
    if (compressed_points >= num_points) {
        vinfo("decompressing cached compressed bn254 crs (", compressed_points, " points)...");
        auto data = read_file(compressed_path, num_points * COMPRESSED_POINT_SIZE);
        auto points = decompress_g1_points(data, num_points);
        write_uncompressed_g1_points(points, uncompressed_path);
        vinfo("cached uncompressed bn254 crs at ", uncompressed_path);
        return points;
    }

    if (!allow_download && compressed_points == 0) {
        throw_or_abort("bn254 g1 data not found at " + path.string() +
                       " and bb does not automatically download in this context." +
                       " Run barretenberg/crs/bootstrap.sh to download.");
    } else if (!allow_download) {
        throw_or_abort(format("bn254 g1 data had ",
                              compressed_points,
                              " points and ",
                              num_points,
                              " were requested but download not allowed in this context"));
    }

    // Double-check after acquiring lock (another process may have downloaded while we waited)
    uncompressed_points = get_file_size(uncompressed_path) / UNCOMPRESSED_POINT_SIZE;
    if (uncompressed_points >= num_points) {
        return read_uncompressed_g1_points(uncompressed_path, num_points);
    }
    compressed_points = get_file_size(compressed_path) / COMPRESSED_POINT_SIZE;
    if (compressed_points >= num_points) {
        auto data = read_file(compressed_path, num_points * COMPRESSED_POINT_SIZE);
        auto points = decompress_g1_points(data, num_points);
        write_uncompressed_g1_points(points, uncompressed_path);
        return points;
    }

    // 3. Download compressed, decompress, cache uncompressed
    vinfo("downloading bn254 crs...");
    auto data = download_bn254_g1_data(num_points, primary_url, fallback_url);
    write_file(compressed_path, data);
    auto points = decompress_g1_points(data, num_points);
    write_uncompressed_g1_points(points, uncompressed_path);
    vinfo("cached uncompressed bn254 crs at ", uncompressed_path);
    return points;
}

// Default overload using production URLs
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download)
{
    return get_bn254_g1_data(path, num_points, allow_download, CRS_PRIMARY_URL, CRS_FALLBACK_URL);
}

} // namespace bb
