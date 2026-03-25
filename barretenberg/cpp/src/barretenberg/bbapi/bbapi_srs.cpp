/**
 * @file bbapi_srs.cpp
 * @brief Implementation of SRS initialization command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::bbapi {

SrsInitSrs::Response SrsInitSrs::execute(BB_UNUSED BBApiRequest& request) &&
{
    constexpr size_t COMPRESSED_POINT_SIZE = 32;
    constexpr size_t UNCOMPRESSED_POINT_SIZE = sizeof(g1::affine_element); // 64

    size_t bytes_per_point = num_points > 0 ? points_buf.size() / num_points : 0;
    std::vector<g1::affine_element> g1_points(num_points);
    std::vector<uint8_t> uncompressed_out;

    if (bytes_per_point == UNCOMPRESSED_POINT_SIZE) {
        // Already uncompressed: fast path with from_buffer
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(static_cast<size_t>(num_points))) {
                g1_points[i] = from_buffer<g1::affine_element>(points_buf.data(), i * UNCOMPRESSED_POINT_SIZE);
            }
        });
    } else if (bytes_per_point == COMPRESSED_POINT_SIZE) {
        // Compressed: decompress and return uncompressed bytes for caller to cache
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(static_cast<size_t>(num_points))) {
                uint256_t c = from_buffer<uint256_t>(points_buf.data(), i * COMPRESSED_POINT_SIZE);
                g1_points[i] = g1::affine_element::from_compressed(c);
            }
        });
        // Serialize uncompressed points to return to caller for caching
        uncompressed_out.resize(static_cast<size_t>(num_points) * UNCOMPRESSED_POINT_SIZE);
        parallel_for([&](ThreadChunk chunk) {
            for (auto i : chunk.range(static_cast<size_t>(num_points))) {
                auto buf = to_buffer(g1_points[i]);
                std::copy(buf.begin(), buf.end(), &uncompressed_out[i * UNCOMPRESSED_POINT_SIZE]);
            }
        });
    } else {
        throw_or_abort("SrsInitSrs: invalid points_buf size. Expected 32 or 64 bytes per point, got " +
                       std::to_string(bytes_per_point));
    }

    // Parse G2 point from buffer (128 bytes)
    auto g2_point_elem = from_buffer<g2::affine_element>(g2_point.data());

    // Initialize BN254 SRS
    bb::srs::init_bn254_mem_crs_factory(g1_points, g2_point_elem);

    return { .points_buf = std::move(uncompressed_out) };
}

SrsInitGrumpkinSrs::Response SrsInitGrumpkinSrs::execute(BB_UNUSED BBApiRequest& request) &&
{
    // Parse Grumpkin affine elements from buffer
    std::vector<curve::Grumpkin::AffineElement> points(num_points);
    for (uint32_t i = 0; i < num_points; ++i) {
        points[i] =
            from_buffer<curve::Grumpkin::AffineElement>(points_buf.data(), i * sizeof(curve::Grumpkin::AffineElement));
    }

    // Initialize Grumpkin SRS
    bb::srs::init_grumpkin_mem_crs_factory(points);

    return {};
}

} // namespace bb::bbapi
