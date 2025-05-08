#include "get_bn254_crs.hpp"
#include "barretenberg/api/exec_pipe.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"

namespace {
std::vector<uint8_t> download_bn254_g1_data(size_t num_points)
{
    size_t g1_end = num_points * sizeof(bb::g1::affine_element) - 1;

    std::string url = "https://crs.aztec.network/g1.dat";

    // IMPORTANT: this currently uses a shell, DO NOT let user-controlled strings here.
    std::string command = "curl -H \"Range: bytes=0-" + std::to_string(g1_end) + "\" '" + url + "'";

    auto data = bb::exec_pipe(command);
    // Header + num_points * sizeof point.
    if (data.size() < g1_end) {
        throw_or_abort("Failed to download g1 data.");
    }

    return data;
}

std::vector<uint8_t> download_bn254_g2_data()
{
    std::string url = "https://crs.aztec.network/g2.dat";
    // IMPORTANT: this currently uses a shell, DO NOT let user-controlled strings here.
    std::string command = "curl '" + url + "'";
    return bb::exec_pipe(command);
}
} // namespace

namespace bb {
std::vector<g1::affine_element> get_bn254_g1_data(const std::filesystem::path& path,
                                                  size_t num_points,
                                                  bool allow_download)
{
    // TODO(AD): per Charlie this should just download and replace the flat file portion atomically so we have no race
    // condition
    std::filesystem::create_directories(path);

    auto g1_path = path / "bn254_g1.dat";
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
    vinfo("downloading bn254 crs...");
    auto data = download_bn254_g1_data(num_points);
    write_file(g1_path, data);

    auto points = std::vector<g1::affine_element>(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        points[i] = from_buffer<g1::affine_element>(data, i * sizeof(g1::affine_element));
    }
    return points;
}

g2::affine_element get_bn254_g2_data(const std::filesystem::path& path, bool allow_download)
{
    std::filesystem::create_directories(path);

    auto g2_path = path / "bn254_g2.dat";
    size_t g2_file_size = get_file_size(g2_path);

    if (g2_file_size == sizeof(g2::affine_element)) {
        auto data = read_file(g2_path);
        return from_buffer<g2::affine_element>(data.data());
    }
    if (!allow_download) {
        throw_or_abort("bn254 g2 data not found and download not allowed in this context");
    }
    auto data = download_bn254_g2_data();
    write_file(g2_path, data);
    return from_buffer<g2::affine_element>(data.data());
}
} // namespace bb
