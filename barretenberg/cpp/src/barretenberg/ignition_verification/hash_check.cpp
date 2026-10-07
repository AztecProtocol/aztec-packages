#include "hash_check.hpp"
#include <barretenberg/common/log.hpp>
#include <barretenberg/common/throw_or_abort.hpp>
#include <barretenberg/crypto/sha256/sha256.hpp>
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/srs/factories/bn254_g1_chunk_hashes.hpp>

namespace bb::ignition {

size_t verify_cdn_chunk_hashes(const std::vector<G1>& verified_points)
{
    // CDN layout: [generator, verified_points[0], verified_points[1], ...]
    // Total CDN points covered by hashes: SRS_TOTAL_POINTS = 33,554,433
    // We need verified_points to have at least SRS_TOTAL_POINTS - 1 points
    const size_t cdn_points_needed = srs::SRS_TOTAL_POINTS - 1; // 33,554,432
    if (verified_points.size() < cdn_points_needed) {
        throw_or_abort("Need at least " + std::to_string(cdn_points_needed) +
                       " verified points for CDN hash check, got " + std::to_string(verified_points.size()));
    }

    // Serialize points in CDN format: x-first big-endian, 64 bytes per point
    // The write() free function in affine_element.hpp calls serialize_to_buffer with write_x_first=true
    auto serialize_point = [](const G1& point, uint8_t* buf) {
        G1::serialize_to_buffer(point, buf, /* write_x_first */ true);
    };

    size_t mismatches = 0;

    // Process each chunk
    for (size_t chunk_idx = 0; chunk_idx < srs::SRS_NUM_CHUNKS; ++chunk_idx) {
        size_t chunk_start_point = chunk_idx * srs::SRS_CHUNK_SIZE_POINTS;
        size_t chunk_end_point = std::min(chunk_start_point + srs::SRS_CHUNK_SIZE_POINTS, srs::SRS_TOTAL_POINTS);
        size_t points_in_chunk = chunk_end_point - chunk_start_point;
        size_t chunk_bytes = points_in_chunk * 64;

        // Build the chunk data in CDN format
        std::vector<uint8_t> chunk_data(chunk_bytes);

        for (size_t i = 0; i < points_in_chunk; ++i) {
            size_t cdn_point_index = chunk_start_point + i;
            if (cdn_point_index == 0) {
                // First CDN point is the generator
                serialize_point(g1::affine_one, chunk_data.data() + i * 64);
            } else {
                // CDN point k corresponds to verified_points[k-1]
                serialize_point(verified_points[cdn_point_index - 1], chunk_data.data() + i * 64);
            }
        }

        // Compute SHA-256 and compare
        auto hash = crypto::sha256(std::span<const uint8_t>(chunk_data));
        if (hash != srs::BN254_G1_CHUNK_HASHES[chunk_idx]) {
            info("CDN hash mismatch at chunk ", chunk_idx);
            ++mismatches;
        }
    }

    return mismatches;
}

} // namespace bb::ignition
