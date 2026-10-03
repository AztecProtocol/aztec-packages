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
    if (data.empty() || data.size() > srs::GRUMPKIN_G1_SIZE_BYTES ||
        data.size() % srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES != 0) {
        throw_or_abort("Grumpkin CRS must contain complete pinned chunks (1 to " +
                       std::to_string(srs::GRUMPKIN_G1_NUM_CHUNKS) + " chunks)");
    }
    const size_t full_chunks = data.size() / srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES;
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
    if (num_points == 0 || num_points > srs::GRUMPKIN_G1_NUM_POINTS) {
        throw_or_abort("Grumpkin CRS point count must be between 1 and " + std::to_string(srs::GRUMPKIN_G1_NUM_POINTS));
    }
    const size_t chunks_needed =
        (num_points + srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS - 1) / srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS;
    const size_t verify_points = chunks_needed * srs::GRUMPKIN_G1_CHUNK_SIZE_POINTS;
    const size_t verify_bytes = verify_points * sizeof(curve::Grumpkin::AffineElement);

    std::filesystem::create_directories(path);
    const auto g1_path = path / "grumpkin_g1_v2.flat.dat";
    const auto lock_path = path / "crs.lock";
    // Acquire exclusive lock to prevent simultaneous generation/writes
    FileLockGuard lock(lock_path.string());

    // A short cache cannot authenticate even a smaller requested prefix against the chunk pins.
    if (get_file_size(g1_path) >= verify_bytes) {
        vinfo("using cached grumpkin crs with num points ", num_points, " at: ", g1_path);
        const auto data = read_file(g1_path, verify_bytes);
        if (data.size() != verify_bytes) {
            throw_or_abort("Truncated Grumpkin CRS");
        }
        verify_grumpkin_crs_integrity(data);
        std::vector<curve::Grumpkin::AffineElement> points(num_points);
        for (size_t i = 0; i < num_points; ++i) {
            points[i] = from_buffer<curve::Grumpkin::AffineElement>(data, i * sizeof(curve::Grumpkin::AffineElement));
        }
        return points;
    }

    if (!allow_download) {
        throw_or_abort(format("Grumpkin CRS cache needs ",
                              verify_points,
                              " points for integrity verification, but generation is not allowed"));
    }

    vinfo("generating grumpkin crs...");
    auto points = srs::generate_grumpkin_srs(verify_points);
    const auto data = to_buffer(points);
    verify_grumpkin_crs_integrity(data);
    write_file(g1_path, data);
    points.resize(num_points);
    return points;
}
} // namespace bb
