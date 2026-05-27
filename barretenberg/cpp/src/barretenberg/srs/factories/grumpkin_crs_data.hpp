#pragma once
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include <array>
#include <cstddef>
#include <cstdint>

namespace bb::srs {

/**
 * @brief Canonical number of points in the Aztec Grumpkin SRS published at
 * `https://crs.aztec-cdn.foundation/grumpkin_g1.dat`.
 *
 * @details Sized for ECCVM proving (`CONST_ECCVM_LOG_N = 15`, 2^15 IPA opening rounds) with one
 * doubling of headroom. This is the size that `barretenberg/crs/bootstrap.sh` downloads.
 */
inline constexpr size_t GRUMPKIN_G1_NUM_POINTS = 1ULL << 18;

/**
 * @brief Canonical byte length of the Aztec Grumpkin SRS file.
 *
 * @details Each affine point is 64 bytes (Fq.x ‖ Fq.y, big-endian). 2^18 × 64 = 16 MiB.
 */
inline constexpr size_t GRUMPKIN_G1_SIZE_BYTES = GRUMPKIN_G1_NUM_POINTS * sizeof(curve::Grumpkin::AffineElement);

/**
 * @brief Per-chunk SHA-256 anchors for the transparent Grumpkin SRS.
 *
 * @details Callers request a prefix of the SRS (bb.js fetches 2^16, the native prover requests its
 * dyadic ECCVM size, bootstrap downloads all 2^18), so anchoring must work on prefixes.
 * `GRUMPKIN_G1_CHUNK_HASHES[c]` is the SHA-256 of chunk `c` (`GRUMPKIN_G1_CHUNK_SIZE_POINTS`
 * points), letting any prefix covering whole chunks be verified. The SRS is deterministic
 * (`generate_grumpkin_srs`), so `GrumpkinG1GeneratorMatchesChunkHashes` pins these against the
 * generator; update them in lockstep with re-uploading the file to both CRS hosts.
 */
inline constexpr size_t GRUMPKIN_G1_NUM_CHUNKS = 4;
inline constexpr size_t GRUMPKIN_G1_CHUNK_SIZE_POINTS = GRUMPKIN_G1_NUM_POINTS / GRUMPKIN_G1_NUM_CHUNKS;
inline constexpr size_t GRUMPKIN_G1_CHUNK_SIZE_BYTES =
    GRUMPKIN_G1_CHUNK_SIZE_POINTS * sizeof(curve::Grumpkin::AffineElement);

inline constexpr std::array<std::array<uint8_t, 32>, GRUMPKIN_G1_NUM_CHUNKS> GRUMPKIN_G1_CHUNK_HASHES = { {
    { 0x64, 0x23, 0x6c, 0x94, 0x55, 0xe7, 0x5a, 0xee, 0xa7, 0x7a, 0x94, 0x58, 0x7e, 0xa6, 0x07, 0xee,
      0xd2, 0xe9, 0x78, 0xd2, 0x60, 0x9a, 0x42, 0x1d, 0x66, 0xbf, 0x10, 0xbb, 0x96, 0x98, 0xb8, 0xfd },
    { 0xf4, 0xac, 0xd7, 0x8e, 0x41, 0x5e, 0x4d, 0xb2, 0x1f, 0xb2, 0x37, 0x88, 0x8c, 0x23, 0x10, 0x5f,
      0x49, 0x19, 0xd3, 0x0e, 0x18, 0x22, 0x6f, 0xaa, 0x47, 0x0a, 0x11, 0xae, 0xc6, 0x9e, 0x49, 0xbb },
    { 0xd0, 0x0e, 0x44, 0x59, 0xfc, 0xaf, 0xf4, 0xdb, 0xb7, 0xa1, 0xe6, 0xc9, 0x37, 0xd4, 0x84, 0x66,
      0xa4, 0x4e, 0x00, 0x93, 0x8e, 0xf1, 0x7d, 0x56, 0xf9, 0xa6, 0xde, 0xbb, 0x0f, 0x63, 0x50, 0x9d },
    { 0xfd, 0xb5, 0x55, 0x46, 0x52, 0xa0, 0x2c, 0xb0, 0x5c, 0x69, 0x31, 0xb9, 0x69, 0xce, 0xcc, 0xfa,
      0xea, 0x4d, 0x38, 0xe7, 0x49, 0x79, 0x17, 0x9d, 0x1c, 0xf0, 0xcf, 0x4b, 0xe2, 0xa8, 0xf8, 0x9d },
} };

} // namespace bb::srs
