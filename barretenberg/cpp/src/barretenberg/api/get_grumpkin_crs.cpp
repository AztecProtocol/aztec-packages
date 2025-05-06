#include "get_grumpkin_crs.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace {
std::vector<uint8_t> download_grumpkin_g1_data(size_t num_points)
{
    size_t g1_start = 28;
    size_t g1_end = g1_start + num_points * 64 - 1;

    std::string url = "https://aztec-ignition.s3.amazonaws.com/TEST%20GRUMPKIN/monomial/transcript00.dat";

    // IMPORTANT: this currently uses a shell, DO NOT let user-controlled strings here.
    std::string command =
        "curl -s -H \"Range: bytes=" + std::to_string(g1_start) + "-" + std::to_string(g1_end) + "\" '" + url + "'";

    auto data = exec_pipe(command);
    // Header + num_points * sizeof point.
    if (data.size() < g1_end - g1_start) {
        THROW std::runtime_error("Failed to download grumpkin g1 data.");
    }

    return data;
}
} // namespace

namespace bb {
std::vector<curve::Grumpkin::AffineElement> get_grumpkin_g1_data(const std::filesystem::path& path,
                                                                 size_t num_points,
                                                                 bool allow_download)
{
    // TODO(AD): per Charlie this should just download and replace the flat file portion atomically so we have no race
    // condition
    std::filesystem::create_directories(path);
    auto g1_path = path / "grumpkin_g1.dat";
    size_t g1_file_size = get_file_size(g1_path);
    size_t size = g1_file_size / sizeof(curve::Grumpkin::AffineElement);
    if (size >= num_points && g1_file_size % sizeof(curve::Grumpkin::AffineElement) == 0) {
        vinfo("using cached grumpkin crs of size ", size, " at: ", g1_path);
        auto data = read_file(g1_path, num_points * sizeof(curve::Grumpkin::AffineElement));
        auto points = std::vector<curve::Grumpkin::AffineElement>(num_points);
        for (uint32_t i = 0; i < num_points; ++i) {
            points[i] = from_buffer<curve::Grumpkin::AffineElement>(data, i * sizeof(curve::Grumpkin::AffineElement));
        }
        return points;
    }
    if (!allow_download) {
        throw_or_abort("grumpkin g1 data not found and download not allowed in this context");
    }
    vinfo("downloading grumpkin crs...");
    auto data = download_grumpkin_g1_data(num_points);
    write_file(path / "grumpkin_g1.dat", data);

    auto points = std::vector<curve::Grumpkin::AffineElement>(num_points);
    for (uint32_t i = 0; i < num_points; ++i) {
        points[i] = from_buffer<curve::Grumpkin::AffineElement>(data, i * sizeof(curve::Grumpkin::AffineElement));
    }
    return points;
}
} // namespace bb
