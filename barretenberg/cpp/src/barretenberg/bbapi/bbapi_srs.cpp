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

SrsInit::Response SrsInit::execute(BB_UNUSED BBApiRequest& request) &&
{
    // Initialize BN254 if data is provided
    bool bn254_has_buffer = !bn254_points_buf.empty() && !bn254_g2_point.empty() && bn254_num_points > 0;
    bool bn254_has_path = !bn254_path.empty();

    if (bn254_has_buffer) {
        // Buffer takes precedence - initialize from memory
        std::vector<g1::affine_element> g1_points(bn254_num_points);
        for (size_t i = 0; i < bn254_num_points; ++i) {
            g1_points[i] = from_buffer<g1::affine_element>(bn254_points_buf.data(), i * 64);
        }

        auto g2_point_elem = from_buffer<g2::affine_element>(bn254_g2_point.data());
        bb::srs::init_bn254_mem_crs_factory(g1_points, g2_point_elem);
    } else if (bn254_has_path) {
        // Initialize from file
        bb::srs::init_bn254_file_crs_factory(bn254_path);
    }

    // Initialize Grumpkin if data is provided
    bool grumpkin_has_buffer = !grumpkin_points_buf.empty() && grumpkin_num_points > 0;
    bool grumpkin_has_path = !grumpkin_path.empty();

    if (grumpkin_has_buffer) {
        // Buffer takes precedence - initialize from memory
        std::vector<curve::Grumpkin::AffineElement> points(grumpkin_num_points);
        for (uint32_t i = 0; i < grumpkin_num_points; ++i) {
            points[i] = from_buffer<curve::Grumpkin::AffineElement>(grumpkin_points_buf.data(),
                                                                    i * sizeof(curve::Grumpkin::AffineElement));
        }
        bb::srs::init_grumpkin_mem_crs_factory(points);
    } else if (grumpkin_has_path) {
        // Initialize from file
        bb::srs::init_grumpkin_file_crs_factory(grumpkin_path);
    }

    return {};
}

} // namespace bb::bbapi
