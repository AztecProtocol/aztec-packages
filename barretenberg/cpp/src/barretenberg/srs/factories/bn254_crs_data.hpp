#pragma once
#include "barretenberg/common/serialize.hpp"
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"

namespace bb::srs {

/**
 * @brief Expected first G1 element from BN254 CRS
 * @details The first element of the G1 CRS is the standard BN254 G1 generator point (1, 2).
 * This is used to verify the integrity of downloaded CRS files.
 */
inline constexpr g1::affine_element BN254_G1_FIRST_ELEMENT = g1::affine_one;

/**
 * @brief Expected second G1 element from BN254 CRS
 * @details This is the second point in the BN254 CRS, corresponding to tau * G where tau is the secret from the
 * trusted setup. Reference: https://crs.aztec-cdn.foundation/g1.dat (bytes 64-127)
 */
inline g1::affine_element get_bn254_g1_second_element()
{
    // Hardcoded second G1 element (64 bytes) - see reference URL above
    static constexpr uint8_t g1_second_data[64] = { 0x2d, 0x36, 0x06, 0x28, 0x28, 0x9f, 0xf9, 0x43, 0xff, 0x6b, 0xd1,
                                                    0xa8, 0x7b, 0xbe, 0x4e, 0x62, 0xab, 0xe7, 0xfb, 0x61, 0xba, 0x83,
                                                    0xef, 0xfd, 0x26, 0x6f, 0x22, 0xbd, 0xcf, 0x31, 0xe6, 0xf9, 0x26,
                                                    0xb9, 0x2a, 0x79, 0xe5, 0x63, 0xc3, 0xf4, 0x82, 0x52, 0xcc, 0xe7,
                                                    0xfe, 0xec, 0xa2, 0xf0, 0xf8, 0xd3, 0x3d, 0xcb, 0x4e, 0xf7, 0xb0,
                                                    0x64, 0x3b, 0xf0, 0x7b, 0xd4, 0x05, 0x70, 0x0a, 0xaa };
    return from_buffer<g1::affine_element>(g1_second_data);
}

/**
 * @brief Raw 128-byte serialization of the BN254 G2 trusted-setup point [x]_2.
 * @details Identical to the contents of `bn254_g2.dat` distributed at
 * https://crs.aztec-cdn.foundation/g2.dat. Exposed as a public constant so callers can
 * SHA-256-pin the exact CDN bytes (see `BN254_G2_ELEMENT_SHA256` below).
 */
inline constexpr std::array<uint8_t, 128> BN254_G2_ELEMENT_BYTES = {
    0x01, 0x18, 0xc4, 0xd5, 0xb8, 0x37, 0xbc, 0xc2, 0xbc, 0x89, 0xb5, 0xb3, 0x98, 0xb5, 0x97, 0x4e, 0x9f, 0x59, 0x44,
    0x07, 0x3b, 0x32, 0x07, 0x8b, 0x7e, 0x23, 0x1f, 0xec, 0x93, 0x88, 0x83, 0xb0, 0x26, 0x0e, 0x01, 0xb2, 0x51, 0xf6,
    0xf1, 0xc7, 0xe7, 0xff, 0x4e, 0x58, 0x07, 0x91, 0xde, 0xe8, 0xea, 0x51, 0xd8, 0x7a, 0x35, 0x8e, 0x03, 0x8b, 0x4e,
    0xfe, 0x30, 0xfa, 0xc0, 0x93, 0x83, 0xc1, 0x22, 0xfe, 0xbd, 0xa3, 0xc0, 0xc0, 0x63, 0x2a, 0x56, 0x47, 0x5b, 0x42,
    0x14, 0xe5, 0x61, 0x5e, 0x11, 0xe6, 0xdd, 0x3f, 0x96, 0xe6, 0xce, 0xa2, 0x85, 0x4a, 0x87, 0xd4, 0xda, 0xcc, 0x5e,
    0x55, 0x04, 0xfc, 0x63, 0x69, 0xf7, 0x11, 0x0f, 0xe3, 0xd2, 0x51, 0x56, 0xc1, 0xbb, 0x9a, 0x72, 0x85, 0x9c, 0xf2,
    0xa0, 0x46, 0x41, 0xf9, 0x9b, 0xa4, 0xee, 0x41, 0x3c, 0x80, 0xda, 0x6a, 0x5f, 0xe4
};

/**
 * @brief SHA-256 hash of `BN254_G2_ELEMENT_BYTES`.
 * @details Pinned so any G2 ingress (network download, on-disk cache, bbapi caller) can verify it
 * is delivering the canonical Aztec trusted-setup [x]_2. Mirrors the `BN254_G1_CHUNK_HASHES`
 * mechanism used for the (much larger) G1 CRS. Update this constant only in lockstep with
 * `BN254_G2_ELEMENT_BYTES`; the test `CrsFactory.Bn254G2HashMatchesPinnedBytes` enforces this.
 */
inline constexpr std::array<uint8_t, 32> BN254_G2_ELEMENT_SHA256 = { 0x01, 0x79, 0x7b, 0xfc, 0x4d, 0xe5, 0xa9, 0x6f,
                                                                     0x0e, 0x51, 0x6a, 0x9e, 0xa4, 0x53, 0x7d, 0x18,
                                                                     0x78, 0x6d, 0xc3, 0x0c, 0xb9, 0x91, 0xac, 0xa4,
                                                                     0x27, 0x4c, 0x95, 0x82, 0x2b, 0x69, 0xc3, 0x2f };

/**
 * @brief Reference BN254 G2 element from the trusted setup CRS
 * @details This is the single G2 point used in the BN254 CRS for verification.
 * Reference: https://crs.aztec-cdn.foundation/g2.dat
 */
inline g2::affine_element get_bn254_g2_crs_element()
{
    return from_buffer<g2::affine_element>(BN254_G2_ELEMENT_BYTES.data());
}

/**
 * @brief Compressed form of the first G1 element (generator point).
 * @details For (1, 2): x=1, y=2 is even so sign bit = 0, compressed = uint256_t(1).
 */
inline constexpr uint256_t BN254_G1_FIRST_ELEMENT_COMPRESSED = uint256_t(1);

/**
 * @brief Compressed form of the second G1 element from the trusted setup.
 * @details x = 0x2d360628289ff943ff6bd1a87bbe4e62abe7fb61ba83effd266f22bdcf31e6f9
 *          y = 0x26b92a79e563c3f48252cce7feeca2f0f8d33dcb4ef7b0643bf07bd405700aaa (even, sign bit = 0)
 */
inline constexpr uint256_t BN254_G1_SECOND_ELEMENT_COMPRESSED =
    uint256_t(0x266f22bdcf31e6f9ULL, 0xabe7fb61ba83effdULL, 0xff6bd1a87bbe4e62ULL, 0x2d360628289ff943ULL);

} // namespace bb::srs
