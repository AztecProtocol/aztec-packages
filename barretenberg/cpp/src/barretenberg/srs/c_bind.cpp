#include "c_bind.hpp"

#include <arpa/inet.h>
#include <barretenberg/ecc/curves/bn254/g1.hpp>
#include <barretenberg/ecc/curves/bn254/g2.hpp>
#include <stddef.h>
#include <vector>

#include "./io.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/wasm_export.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/fields/field2_declarations.hpp"
#include "barretenberg/ecc/fields/field_declarations.hpp"
#include "barretenberg/ecc/fields/field_impl.hpp"
#include "barretenberg/ecc/fields/field_impl_generic.hpp"
#include "barretenberg/ecc/fields/field_impl_x64.hpp"
#include "barretenberg/ecc/groups/affine_element.hpp"
#include "global_crs.hpp"

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
    bb::srs::init_crs_factory(g1_points, g2_point);
}

/**
 * WARNING: The SRS is not encoded the same way as all the read/write methods encode.
 * Have to use the old school io functions to parse the buffers.
 */
WASM_EXPORT void srs_init_grumpkin_srs(uint8_t const* points_buf, uint32_t const* num_points)
{
    auto points = std::vector<curve::Grumpkin::AffineElement>(ntohl(*num_points));
    srs::IO<curve::Grumpkin>::read_affine_elements_from_buffer(points.data(), (char*)points_buf, points.size() * 64);

    bb::srs::init_grumpkin_crs_factory(points);
}