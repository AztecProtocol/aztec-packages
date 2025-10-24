/**
 * @file bbapi_srs.cpp
 * @brief Implementation of SRS initialization command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/srs/global_crs.hpp"

namespace bb::bbapi {

SrsInitSrs::Response SrsInitSrs::execute(BB_UNUSED BBApiRequest& request) &&
{
    // Parse G1 points from buffer (64 bytes each)
    std::vector<g1::affine_element> g1_points(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        g1_points[i] = from_buffer<g1::affine_element>(points_buf.data(), i * 64);
    }

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
