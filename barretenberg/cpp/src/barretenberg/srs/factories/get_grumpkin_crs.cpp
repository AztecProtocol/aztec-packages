#include "get_grumpkin_crs.hpp"
#include "barretenberg/api/exec_pipe.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"

namespace {
std::vector<uint8_t> download_grumpkin_g1_data(size_t num_points)
{
    size_t g1_end = num_points * sizeof(bb::curve::Grumpkin::AffineElement) - 1;
    std::string url = "https://crs.aztec.network/grumpkin_g1.dat";

    // IMPORTANT: this currently uses a shell, DO NOT let user-controlled strings here.
    std::string command = "curl -s -H \"Range: bytes=0-" + std::to_string(g1_end) + "\" '" + url + "'";

    auto data = bb::exec_pipe(command);
    if (data.size() < g1_end) {
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
    auto g1_path = path / "grumpkin_g1.flat.dat";
    size_t g1_downloaded_points = get_file_size(g1_path) / sizeof(curve::Grumpkin::AffineElement);
    if (g1_downloaded_points >= num_points) {
        vinfo("using cached grumpkin crs with num points ", g1_downloaded_points, " at: ", g1_path);
        auto data = read_file(g1_path, num_points * sizeof(curve::Grumpkin::AffineElement));
        std::vector<curve::Grumpkin::AffineElement> points(num_points);
        for (uint32_t i = 0; i < num_points; ++i) {
            points[i] = from_buffer<curve::Grumpkin::AffineElement>(data, i * sizeof(curve::Grumpkin::AffineElement));
        }
        if (points[0].on_curve()) {
            return points;
        }
    }
    if (!allow_download && g1_downloaded_points == 0) {
        throw_or_abort("grumpkin g1 data not found and download not allowed in this context");
    } else if (!allow_download) {
        throw_or_abort(format("grumpkin g1 data had ",
                              g1_downloaded_points,
                              " points and ",
                              num_points,
                              " were requested but download not allowed in this context"));
    }
    vinfo("downloading grumpkin crs...");
    auto data = download_grumpkin_g1_data(num_points);
    write_file(path / "grumpkin_g1.flat.dat", data);

    std::vector<curve::Grumpkin::AffineElement> points(num_points);
    for (uint32_t i = 0; i < num_points; ++i) {
        points[i] = from_buffer<curve::Grumpkin::AffineElement>(data, i * sizeof(curve::Grumpkin::AffineElement));
    }
    return points;
}
} // namespace bb
