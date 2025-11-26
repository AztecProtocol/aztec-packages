/**
 * @file curve_constants.cpp
 * @brief Implementation of msgpack-encoded curve constants generation
 */
#include "curve_constants.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <iostream>

namespace bb {

struct CurveConstants {
    // BN254
    uint256_t bn254_fr_modulus;
    uint256_t bn254_fq_modulus;
    bb::g1::affine_element bn254_g1_generator;
    bb::g2::affine_element bn254_g2_generator;

    // Grumpkin
    uint256_t grumpkin_fr_modulus;
    uint256_t grumpkin_fq_modulus;
    grumpkin::g1::affine_element grumpkin_g1_generator;

    // Secp256k1
    uint256_t secp256k1_fr_modulus;
    uint256_t secp256k1_fq_modulus;
    secp256k1::g1::affine_element secp256k1_g1_generator;

    // Secp256r1
    uint256_t secp256r1_fr_modulus;
    uint256_t secp256r1_fq_modulus;
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

static CurveConstants get_curve_constants()
{
    CurveConstants constants;

    // BN254
    constants.bn254_fr_modulus = uint256_t(bb::fr::modulus);
    constants.bn254_fq_modulus = uint256_t(bb::fq::modulus);
    constants.bn254_g1_generator = bb::g1::affine_element(bb::g1::one);
    constants.bn254_g2_generator = bb::g2::affine_element(bb::g2::one);

    // Grumpkin (note: grumpkin::fq is bb::fr, grumpkin::fr is bb::fq)
    constants.grumpkin_fr_modulus = uint256_t(grumpkin::fr::modulus);
    constants.grumpkin_fq_modulus = uint256_t(grumpkin::fq::modulus);
    constants.grumpkin_g1_generator = grumpkin::g1::affine_element(grumpkin::g1::one);

    // Secp256k1
    constants.secp256k1_fr_modulus = uint256_t(secp256k1::fr::modulus);
    constants.secp256k1_fq_modulus = uint256_t(secp256k1::fq::modulus);
    constants.secp256k1_g1_generator = secp256k1::g1::affine_element(secp256k1::g1::one);

    // Secp256r1
    constants.secp256r1_fr_modulus = uint256_t(secp256r1::fr::modulus);
    constants.secp256r1_fq_modulus = uint256_t(secp256r1::fq::modulus);
    constants.secp256r1_g1_generator = secp256r1::g1::affine_element(secp256r1::g1::one);

    return constants;
}

std::vector<uint8_t> get_curve_constants_msgpack()
{
    CurveConstants constants = get_curve_constants();
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, constants);

    // Convert msgpack buffer to vector
    return std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size());
}

void write_curve_constants_msgpack_to_stdout()
{
    auto msgpack_data = get_curve_constants_msgpack();
    std::cout.write(reinterpret_cast<const char*>(msgpack_data.data()),
                    static_cast<std::streamsize>(msgpack_data.size()));
}

} // namespace bb
