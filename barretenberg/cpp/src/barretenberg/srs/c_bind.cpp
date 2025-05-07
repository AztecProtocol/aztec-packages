#include "c_bind.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "global_crs.hpp"
#include <barretenberg/common/streams.hpp>
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/ecc/curves/bn254/g2.hpp>
#include <cstddef>
#include <cstdint>
#include <sys/types.h>

using namespace bb;

/**
 * We are not passed a vector (length prefixed), but the buffer and num points independently.
 * Saves on having the generate the vector awkwardly calling side after downloading crs.
 */
WASM_EXPORT void srs_init_srs(uint8_t const* points_buf, uint32_t const* num_points_buf, uint8_t const* g2_point_buf)
{
    auto num_points = ntohl(*num_points_buf);
    auto g1_points = std::vector<g1::affine_element>(num_points);
    for (size_t i = 0; i < num_points; ++i) {
        g1_points[i] = from_buffer<bb::g1::affine_element>(points_buf, i * 64);
    }
    auto g2_point = from_buffer<g2::affine_element>(g2_point_buf);
    bb::srs::init_bn254_mem_crs_factory(g1_points, g2_point);
}

/**
 * WARNING: The SRS is not encoded the same way as all the read/write methods encode.
 * Have to use the old school io functions to parse the buffers.
 */
WASM_EXPORT void srs_init_grumpkin_srs(uint8_t const* points_buf, uint32_t const* num_points)
{
    std::vector<curve::Grumpkin::AffineElement> points(ntohl(*num_points));
    for (uint32_t i = 0; i < points.size(); ++i) {
        points[i] = from_buffer<curve::Grumpkin::AffineElement>(points_buf, i * sizeof(curve::Grumpkin::AffineElement));
    }
    bb::srs::init_grumpkin_mem_crs_factory(points);
}
