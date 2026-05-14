/**
 * @file bbapi_srs.cpp
 * @brief Implementation of SRS initialization command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_srs.hpp"
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/common/thread.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/srs/factories/bn254_crs_data.hpp"
#include "barretenberg/srs/factories/bn254_g1_chunk_hashes.hpp"
#include "barretenberg/srs/global_crs.hpp"
#include <span>

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
        // Verify SHA-256 of every 4 MB chunk against the in-binary pin BN254_G1_CHUNK_HASHES.
        // Require chunk-aligned input so every byte is covered (no partial trailing chunk).
        if (points_buf.size() == 0 || points_buf.size() % bb::srs::SRS_CHUNK_SIZE_BYTES != 0) {
            throw_or_abort("SrsInitSrs: compressed points_buf size " + std::to_string(points_buf.size()) +
                           " must be a positive multiple of " + std::to_string(bb::srs::SRS_CHUNK_SIZE_BYTES));
        }
        size_t num_full_chunks = points_buf.size() / bb::srs::SRS_CHUNK_SIZE_BYTES;
        size_t chunks_to_verify = std::min(num_full_chunks, static_cast<size_t>(bb::srs::SRS_NUM_FULL_CHUNKS));
        for (size_t i = 0; i < chunks_to_verify; ++i) {
            auto chunk = std::span<const uint8_t>(points_buf.data() + i * bb::srs::SRS_CHUNK_SIZE_BYTES,
                                                  bb::srs::SRS_CHUNK_SIZE_BYTES);
            auto hash = bb::crypto::sha256(chunk);
            if (hash != bb::srs::BN254_G1_CHUNK_HASHES[i]) {
                throw_or_abort("SrsInitSrs: g1 compressed chunk " + std::to_string(i) + " SHA-256 mismatch");
            }
        }

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

    // Pin the first two G1 points to their canonical trusted-setup values. Defense in depth on the
    // compressed path; the only gate on the uncompressed (cached) path.
    if (num_points >= 1 && g1_points[0] != bb::srs::BN254_G1_FIRST_ELEMENT) {
        throw_or_abort("SrsInitSrs: g1_points[0] is not the canonical BN254 generator");
    }
    if (num_points >= 2 && g1_points[1] != bb::srs::get_bn254_g1_second_element()) {
        throw_or_abort("SrsInitSrs: g1_points[1] does not match the canonical trusted-setup tau·G");
    }

    // Defense in depth: hash-pin AND subgroup-check the G2 input. Hash equality alone is sufficient
    // for the canonical case (it implies prime-order membership); the subgroup check is kept so
    // that any future relaxation of the hash gate (e.g. a flag to allow a different trusted setup)
    // does not silently reopen audit finding #7's small-subgroup attack.
    auto g2_hash = bb::crypto::sha256(std::span<const uint8_t>(g2_point.data(), g2_point.size()));
    if (g2_hash != bb::srs::BN254_G2_ELEMENT_SHA256) {
        throw_or_abort("SrsInitSrs: g2_point bytes do not match the canonical Aztec [x]_2 SHA-256");
    }
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
