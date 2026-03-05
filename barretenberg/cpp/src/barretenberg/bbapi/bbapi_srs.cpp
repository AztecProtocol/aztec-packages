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
    // Decompress 32-byte compressed points in parallel using native field arithmetic
    std::vector<g1::affine_element> g1_points(num_points);
    parallel_for([&](ThreadChunk chunk) {
        for (auto i : chunk.range(static_cast<size_t>(num_points))) {
            uint256_t c = from_buffer<uint256_t>(points_buf.data(), i * 32);
            g1_points[i] = g1::affine_element::from_compressed(c);
        }
    });

    // Parse G2 point from buffer (128 bytes)
    auto g2_point_elem = from_buffer<g2::affine_element>(g2_point.data());

    // Initialize BN254 SRS
    bb::srs::init_bn254_mem_crs_factory(g1_points, g2_point_elem);

    return {};
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
