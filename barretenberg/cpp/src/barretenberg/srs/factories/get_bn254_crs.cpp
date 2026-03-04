#include "get_bn254_crs.hpp"
#include "barretenberg/api/file_io.hpp"
#include <algorithm>
#include "barretenberg/common/flock.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "bn254_crs_data.hpp"
#include "bn254_crs_hashes.hpp"
#include "http_download.hpp"

namespace {
// Primary CRS URL (Cloudflare R2)
constexpr const char* CRS_PRIMARY_URL = "http://crs.aztec-cdn.foundation/g1.dat";
// Fallback CRS URL (AWS S3)
constexpr const char* CRS_FALLBACK_URL = "http://crs.aztec-labs.com/g1.dat";

std::vector<uint8_t> download_bn254_g1_data(size_t num_points,
                                            const std::string& primary_url,
                                            const std::string& fallback_url)
{
    // Round up download size to next 8MB chunk boundary so every downloaded chunk
    // can be fully verified against embedded SHA256 hashes.
    // Cap at 256 full chunks to avoid requesting past end-of-file (the full CRS has
    // 256 full 8MB chunks + a 64-byte remainder that can't fill another chunk).
    constexpr size_t points_per_chunk = bb::srs::CRS_HASH_CHUNK_SIZE / sizeof(bb::g1::affine_element);
    constexpr size_t max_aligned_points = bb::srs::CRS_NUM_FULL_CHUNKS * points_per_chunk;
    size_t aligned_points = ((num_points + points_per_chunk - 1) / points_per_chunk) * points_per_chunk;
    if (aligned_points > max_aligned_points) {
        aligned_points = max_aligned_points;
    }
    // Request enough bytes for whichever is larger: the chunk-aligned amount or the actual request.
    size_t download_points = std::max(aligned_points, num_points);
    size_t g1_end = (download_points * sizeof(bb::g1::affine_element)) - 1;

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

    if (data.size() < sizeof(bb::g1::affine_element)) {
        throw_or_abort("Downloaded g1 data is too small");
    }

    // Verify first element matches the expected generator point (quick sanity check for all download sizes).
    auto first_element = from_buffer<bb::g1::affine_element>(data, 0);
    if (first_element != bb::srs::BN254_G1_FIRST_ELEMENT) {
        throw_or_abort("Downloaded BN254 G1 CRS first element does not match expected point.");
    }

    // Verify integrity of all complete 8MB chunks against embedded SHA256 hashes.
    // This protects against man-in-the-middle attacks on HTTP downloads without requiring SSL/TLS.
    bb::srs::verify_bn254_crs_integrity(data);

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
    std::filesystem::create_directories(path);

    auto g1_path = path / "bn254_g1.dat";
    auto lock_path = path / "crs.lock";
    // Acquire exclusive lock to prevent simultaneous downloads
    FileLockGuard lock(lock_path.string());

    size_t g1_downloaded_points = get_file_size(g1_path) / sizeof(g1::affine_element);

    if (g1_downloaded_points >= num_points) {
        vinfo("using cached bn254 crs with num points ", std::to_string(g1_downloaded_points), " at ", g1_path);
        auto data = read_file(g1_path, num_points * sizeof(g1::affine_element));
        auto points = std::vector<g1::affine_element>(num_points);
        for (size_t i = 0; i < num_points; ++i) {
            points[i] = from_buffer<g1::affine_element>(data, i * sizeof(g1::affine_element));
        }
        return points;
    }

    if (!allow_download && g1_downloaded_points == 0) {
        throw_or_abort("bn254 g1 data not found and download not allowed in this context");
    } else if (!allow_download) {
        throw_or_abort(format("bn254 g1 data had ",
                              g1_downloaded_points,
                              " points and ",
                              num_points,
                              " were requested but download not allowed in this context"));
    }

    // Double-check after acquiring lock (another process may have downloaded while we waited)
    g1_downloaded_points = get_file_size(g1_path) / sizeof(g1::affine_element);
    if (g1_downloaded_points >= num_points) {
        vinfo("using cached bn254 crs with num points ", std::to_string(g1_downloaded_points), " at ", g1_path);
        auto data = read_file(g1_path, num_points * sizeof(g1::affine_element));
        auto points = std::vector<g1::affine_element>(num_points);
        for (size_t i = 0; i < num_points; ++i) {
            points[i] = from_buffer<g1::affine_element>(data, i * sizeof(g1::affine_element));
        }
        return points;
    }

    vinfo("downloading bn254 crs...");
    auto data = download_bn254_g1_data(num_points, primary_url, fallback_url);
    write_file(g1_path, data);

    auto points = std::vector<g1::affine_element>(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        points[i] = from_buffer<g1::affine_element>(data, i * sizeof(g1::affine_element));
    }
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
