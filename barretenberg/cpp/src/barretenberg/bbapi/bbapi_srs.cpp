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
#include "barretenberg/srs/factories/get_grumpkin_crs.hpp"
#include "barretenberg/srs/factories/grumpkin_crs_data.hpp"
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

    // Parse G2 point from buffer (128 bytes). `serialize_from_buffer` validates that the bytes
    // decode to a curve point but does NOT enforce subgroup membership. BN254 G2 has a non-trivial
    // cofactor (h2 ≈ 2^254), so a curve point may lie in a small cofactor subgroup of order
    // dividing h2 rather than the prime-order subgroup of order r. Reject anything outside
    // the prime-order subgroup before it reaches the SRS factory.
    auto g2_point_elem = from_buffer<g2::affine_element>(g2_point.data());
    if (!g2_point_elem.is_in_prime_subgroup()) {
        throw_or_abort("SrsInitSrs: g2_point is not in the BN254 G2 prime-order subgroup");
    }

    // Initialize BN254 SRS
    bb::srs::init_bn254_mem_crs_factory(g1_points, g2_point_elem);

    return { .points_buf = std::move(uncompressed_out) };
}

SrsInitGrumpkinSrs::Response SrsInitGrumpkinSrs::execute(BB_UNUSED BBApiRequest& request) &&
{
    // Validate buffer size before accessing raw pointer
    const size_t required_size = static_cast<size_t>(num_points) * sizeof(curve::Grumpkin::AffineElement);
    if (points_buf.size() < required_size) {
        throw_or_abort("SrsInitGrumpkinSrs: points_buf too small (" + std::to_string(points_buf.size()) +
                       " bytes) for num_points=" + std::to_string(num_points) + " (need " +
                       std::to_string(required_size) + ")");
    }

    // Anchor whole chunks of the WASM-ingress buffer (bb.js fetches 2^16 points = one chunk).
    if (points_buf.size() >= bb::srs::GRUMPKIN_G1_CHUNK_SIZE_BYTES) {
        verify_grumpkin_crs_integrity(std::span<const uint8_t>(points_buf.data(), points_buf.size()));
    }

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
