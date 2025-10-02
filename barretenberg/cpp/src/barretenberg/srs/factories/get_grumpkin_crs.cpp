#include "get_grumpkin_crs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/flock.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "grumpkin_srs_gen.hpp"

namespace bb {
std::vector<curve::Grumpkin::AffineElement> get_grumpkin_g1_data(const std::filesystem::path& path,
                                                                 size_t num_points,
                                                                 bool allow_download)
{
    std::filesystem::create_directories(path);

    auto g1_path = path / "grumpkin_g1.flat.dat";
    auto lock_path = path / "crs.lock";
    // Acquire exclusive lock to prevent simultaneous generation/writes
    FileLockGuard lock(lock_path.string());

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
        throw_or_abort("grumpkin g1 data not found and generation not allowed in this context");
    } else if (!allow_download) {
        throw_or_abort(format("grumpkin g1 data had ",
                              g1_downloaded_points,
                              " points and ",
                              num_points,
                              " were requested but generation not allowed in this context"));
    }

    vinfo("generating grumpkin crs...");
    auto points = srs::generate_grumpkin_srs(num_points);
    write_file(g1_path, to_buffer(points));
    return points;
}
} // namespace bb
