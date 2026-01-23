#include "get_bn254_crs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/flock.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "bn254_crs_data.hpp"
#include "http_download.hpp"

namespace {
std::vector<uint8_t> download_bn254_g1_data(size_t num_points)
{
    size_t g1_end = (num_points * sizeof(bb::g1::affine_element)) - 1;

    // Download via HTTP with Range header
    auto data = bb::srs::http_download("http://crs.aztec.network/g1.dat", 0, g1_end);

    if (data.size() < sizeof(bb::g1::affine_element)) {
        throw_or_abort("Downloaded g1 data is too small");
    }

    // Verify first element matches our expected point.
    auto first_element = from_buffer<bb::g1::affine_element>(data, 0);
    if (first_element != bb::srs::BN254_G1_FIRST_ELEMENT) {
        throw_or_abort("Downloaded BN254 G1 CRS first element does not match expected point.");
    }

    // Verify second element if we have enough data
    if (data.size() >= 2 * sizeof(bb::g1::affine_element)) {
        auto second_element = from_buffer<bb::g1::affine_element>(data, sizeof(bb::g1::affine_element));
        if (second_element != bb::srs::get_bn254_g1_second_element()) {
            throw_or_abort("Downloaded BN254 G1 CRS second element does not match expected point.");
        }
    }

    return data;
}
} // namespace

namespace bb {
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download)
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
    auto data = download_bn254_g1_data(num_points);
    write_file(g1_path, data);

    auto points = std::vector<g1::affine_element>(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        points[i] = from_buffer<g1::affine_element>(data, i * sizeof(g1::affine_element));
    }
    return points;
}

} // namespace bb
