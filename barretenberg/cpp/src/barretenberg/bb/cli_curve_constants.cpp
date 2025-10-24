/**
 * @file cli_curve_constants.cpp
 * @brief CLI command to output curve constants for all supported curves as msgpack
 */
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <array>
#include <iostream>

namespace bb {

struct CurveConstants {
    // BN254
    std::array<uint8_t, 32> bn254_fr_modulus;
    std::array<uint8_t, 32> bn254_fq_modulus;
    bb::g1::affine_element bn254_g1_generator;
    bb::g2::affine_element bn254_g2_generator;

    // Grumpkin
    std::array<uint8_t, 32> grumpkin_fr_modulus;
    std::array<uint8_t, 32> grumpkin_fq_modulus;
    grumpkin::g1::affine_element grumpkin_g1_generator;

    // Secp256k1
    std::array<uint8_t, 32> secp256k1_fr_modulus;
    std::array<uint8_t, 32> secp256k1_fq_modulus;
    secp256k1::g1::affine_element secp256k1_g1_generator;

    // Secp256r1
    std::array<uint8_t, 32> secp256r1_fr_modulus;
    std::array<uint8_t, 32> secp256r1_fq_modulus;
    secp256r1::g1::affine_element secp256r1_g1_generator;

    MSGPACK_FIELDS(bn254_fr_modulus,
                   bn254_fq_modulus,
                   bn254_g1_generator,
                   bn254_g2_generator,
                   grumpkin_fr_modulus,
                   grumpkin_fq_modulus,
                   grumpkin_g1_generator,
                   secp256k1_fr_modulus,
                   secp256k1_fq_modulus,
                   secp256k1_g1_generator,
                   secp256r1_fr_modulus,
                   secp256r1_fq_modulus,
                   secp256r1_g1_generator);
};

/**
 * @brief Helper function to convert a field modulus to big-endian byte array
 */
template <typename Field> std::array<uint8_t, 32> modulus_to_bytes()
{
    std::array<uint8_t, 32> result;
    for (size_t i = 0; i < 4; ++i) {
        uint64_t limb = Field::modulus.data[3 - i]; // big-endian: write MSB first
        for (size_t j = 0; j < 8; ++j) {
            result[i * 8 + j] = static_cast<uint8_t>(limb >> (56 - j * 8));
        }
    }
    return result;
}

CurveConstants get_curve_constants()
{
    CurveConstants constants;

    // BN254
    constants.bn254_fr_modulus = modulus_to_bytes<bb::fr>();
    constants.bn254_fq_modulus = modulus_to_bytes<bb::fq>();
    constants.bn254_g1_generator = bb::g1::affine_element(bb::g1::one);
    constants.bn254_g2_generator = bb::g2::affine_element(bb::g2::one);

    // Grumpkin (note: grumpkin::fq is bb::fr, grumpkin::fr is bb::fq)
    constants.grumpkin_fr_modulus = modulus_to_bytes<grumpkin::fr>();
    constants.grumpkin_fq_modulus = modulus_to_bytes<grumpkin::fq>();
    constants.grumpkin_g1_generator = grumpkin::g1::affine_element(grumpkin::g1::one);

    // Secp256k1
    constants.secp256k1_fr_modulus = modulus_to_bytes<secp256k1::fr>();
    constants.secp256k1_fq_modulus = modulus_to_bytes<secp256k1::fq>();
    constants.secp256k1_g1_generator = secp256k1::g1::affine_element(secp256k1::g1::one);

    // Secp256r1
    constants.secp256r1_fr_modulus = modulus_to_bytes<secp256r1::fr>();
    constants.secp256r1_fq_modulus = modulus_to_bytes<secp256r1::fq>();
    constants.secp256r1_g1_generator = secp256r1::g1::affine_element(secp256r1::g1::one);

    return constants;
}

/**
 * @brief CLI entry point for outputting curve constants as msgpack
 */
void curve_constants_msgpack()
{
    CurveConstants constants = get_curve_constants();
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, constants);
    std::cout.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
}

} // namespace bb
