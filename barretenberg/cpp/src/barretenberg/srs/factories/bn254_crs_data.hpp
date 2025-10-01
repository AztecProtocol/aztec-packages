#pragma once
#include "barretenberg/ecc/curves/bn254/g1.hpp"
#include "barretenberg/ecc/curves/bn254/g2.hpp"

namespace bb::srs {

/**
 * @brief Expected first G1 element from BN254 CRS
 * @details The first element of the G1 CRS should be the generator point (1, 2).
 * This is used to verify the integrity of downloaded CRS files.
 */
inline constexpr g1::affine_element BN254_G1_FIRST_ELEMENT = g1::affine_one;

/**
 * @brief Reference BN254 G2 element from the trusted setup CRS
 * @details This is the single G2 point used in the BN254 CRS for verification.
 * Reference: http://crs.aztec.network/g2.dat
 */
inline g2::affine_element get_bn254_g2_crs_element()
{
    // Hardcoded G2 element (128 bytes) - see reference URL above
    g2::affine_element element;
    element.x = fq2{ { 0xc2bc37b8d5c41801UL, 0x4e97b598b3b589bcUL, 0x8b07323b0744599fUL, 0xb0838893ec1f237eUL },
                     { 0xc7f1f651b2010e26UL, 0xe8de9107584effe7UL, 0x8b038e357ad851eaUL, 0xc18393c0fa30fe4eUL } };
    element.y = fq2{ { 0x2a63c0c0a3bdfe22UL, 0x5e61e514425b4756UL, 0xa2cee6963fdde611UL, 0x555eccdad4874a85UL },
                     { 0xe30f11f76963fc04UL, 0x85729abbc15651d2UL, 0xa49bf94146a0f29cUL, 0xe45f6ada803c41eeUL } };
    return element;
}

} // namespace bb::srs
