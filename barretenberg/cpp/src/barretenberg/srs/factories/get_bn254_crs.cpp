#include "get_bn254_crs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/flock.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "bn254_crs_data.hpp"
#include "http_download.hpp"

namespace {
// Primary CRS URL (Cloudflare R2)
constexpr const char* CRS_PRIMARY_URL = "http://crs.aztec-cdn.foundation/g1_compressed.dat";
// Fallback CRS URL (AWS S3)
constexpr const char* CRS_FALLBACK_URL = "http://crs.aztec-labs.com/g1_compressed.dat";
constexpr size_t COMPRESSED_POINT_SIZE = 32;

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

std::vector<uint8_t> download_bn254_g1_data_compressed(size_t num_points,
                                                       const std::string& primary_url,
                                                       const std::string& fallback_url)
{
    size_t g1_end = (num_points * COMPRESSED_POINT_SIZE) - 1;

    std::vector<uint8_t> data;
#ifndef __wasm__
    try {
        data = bb::srs::http_download(primary_url, 0, g1_end);
    } catch (const std::exception& e) {
        vinfo("Primary CRS download failed: ", e.what(), ". Trying fallback...");
        data = bb::srs::http_download(fallback_url, 0, g1_end);
    }
#else
    data = bb::srs::http_download(primary_url, 0, g1_end);
    static_cast<void>(fallback_url);
#endif

    if (data.size() < COMPRESSED_POINT_SIZE) {
        throw_or_abort("Downloaded compressed g1 data is too small");
    }

    // Verify first element matches our expected compressed point.
    auto first_compressed = from_buffer<uint256_t>(data, 0);
    if (first_compressed != bb::srs::BN254_G1_FIRST_ELEMENT_COMPRESSED) {
        throw_or_abort("Downloaded BN254 G1 CRS first element does not match expected compressed point.");
    }

    // Verify second element if we have enough data
    if (data.size() >= 2 * COMPRESSED_POINT_SIZE) {
        auto second_compressed = from_buffer<uint256_t>(data, COMPRESSED_POINT_SIZE);
        if (second_compressed != bb::srs::BN254_G1_SECOND_ELEMENT_COMPRESSED) {
            throw_or_abort("Downloaded BN254 G1 CRS second element does not match expected compressed point.");
        }
    }

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

    auto compressed_path = path / "bn254_g1_compressed.dat";
    auto lock_path = path / "crs.lock";
    // Acquire exclusive lock to prevent simultaneous downloads
    FileLockGuard lock(lock_path.string());

    // Check for compressed cache first
    size_t compressed_points = get_file_size(compressed_path) / COMPRESSED_POINT_SIZE;
    if (compressed_points >= num_points) {
        vinfo("using cached compressed bn254 crs with ",
              std::to_string(compressed_points),
              " points at ",
              compressed_path);
        auto data = read_file(compressed_path, num_points * COMPRESSED_POINT_SIZE);
        return decompress_g1_points(data, num_points);
    }

    if (!allow_download && compressed_points == 0) {
        throw_or_abort("bn254 g1 data not found and download not allowed in this context");
    } else if (!allow_download) {
        throw_or_abort(format("bn254 g1 data had ",
                              compressed_points,
                              " points and ",
                              num_points,
                              " were requested but download not allowed in this context"));
    }

    // Double-check after acquiring lock (another process may have downloaded while we waited)
    compressed_points = get_file_size(compressed_path) / COMPRESSED_POINT_SIZE;
    if (compressed_points >= num_points) {
        auto data = read_file(compressed_path, num_points * COMPRESSED_POINT_SIZE);
        return decompress_g1_points(data, num_points);
    }

    // Download compressed CRS
    vinfo("downloading compressed bn254 crs...");
    auto data = download_bn254_g1_data_compressed(num_points, primary_url, fallback_url);
    write_file(compressed_path, data);
    return decompress_g1_points(data, num_points);
}

// Default overload using production URLs
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download)
{
    return get_bn254_g1_data(path, num_points, allow_download, CRS_PRIMARY_URL, CRS_FALLBACK_URL);
}

} // namespace bb
