#include "get_grumpkin_crs.hpp"
#include "barretenberg/api/file_io.hpp"
#include "barretenberg/common/flock.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "grumpkin_crs_data.hpp"
#include "grumpkin_srs_gen.hpp"

namespace bb {

void verify_grumpkin_crs_integrity(std::span<const uint8_t> data)
{
    size_t full_chunks = std::min(data.size() / bb::srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES, bb::srs::GRUMPKIN_G1_NUM_CHUNKS);
    for (size_t c = 0; c < full_chunks; ++c) {
        auto chunk = data.subspan(c * bb::srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES, bb::srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES);
        if (bb::crypto::sha256(chunk) != bb::srs::GRUMPKIN_G1_CHUNK_HASHES[c]) {
            throw_or_abort("grumpkin g1 SHA-256 mismatch at chunk " + std::to_string(c));
        }
    }
}

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

        // Read up to the chunk boundary covering num_points and anchor those chunks against the
        // pinned hashes. Sub-chunk requests (only cold-generated small caches) can't form a whole
        // chunk and fall back to the on-curve smoke check below.
        size_t chunks_needed =
            (num_points + bb::srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS - 1) / bb::srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS;
        size_t verify_points = chunks_needed * bb::srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS;
        if (chunks_needed <= bb::srs::GRUMPKIN_G1_NUM_CHUNKS && verify_points <= g1_downloaded_points) {
            auto data = read_file(g1_path, verify_points * sizeof(curve::Grumpkin::AffineElement));
            verify_grumpkin_crs_integrity(std::span<const uint8_t>(data.data(), data.size()));
            std::vector<curve::Grumpkin::AffineElement> points(num_points);
            for (uint32_t i = 0; i < num_points; ++i) {
                points[i] =
                    from_buffer<curve::Grumpkin::AffineElement>(data, i * sizeof(curve::Grumpkin::AffineElement));
            }
            return points;
        }

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
