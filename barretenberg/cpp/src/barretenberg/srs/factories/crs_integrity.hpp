#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <span>

namespace bb::srs {

/**
 * @brief Throw unless `points` are the first `points.size()` points of the canonical BN254 G1 SRS.
 * @details `points.size()` must be a positive multiple of `SRS_CHUNK_SIZE_POINTS`, at most `SRS_NUM_FULL_CHUNKS`
 * chunks. Each chunk is re-encoded in the compressed format (x big-endian, parity of y in bit 255) and its SHA-256 is
 * compared with `BN254_G1_CHUNK_HASHES`. Each point must also be on the curve and not the point at infinity: the
 * compressed encoding determines a point only among points on the curve.
 */
void verify_bn254_g1_points(std::span<const g1::affine_element> points);

/**
 * @brief Throw unless `points` are the first `points.size()` points of the canonical Grumpkin SRS.
 * @details `points.size()` must be a positive multiple of `GRUMPKIN_G1_CHUNK_SIZE_POINTS`, at most
 * `GRUMPKIN_G1_NUM_POINTS`. The SHA-256 of each chunk in the 64-byte encoding is compared with
 * `GRUMPKIN_G1_CHUNK_HASHES`.
 */
void verify_grumpkin_g1_points(std::span<const curve::Grumpkin::AffineElement> points);

} // namespace bb::srs
