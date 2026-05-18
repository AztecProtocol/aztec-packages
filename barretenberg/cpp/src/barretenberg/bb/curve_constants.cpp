/**
 * @file curve_constants.cpp
 * @brief Implementation of msgpack-encoded curve constants generation
 */
#include "curve_constants.hpp"
#include "barretenberg/common/net.hpp"
#include "barretenberg/common/try_catch_shim.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include <iostream>
#include <msgpack.hpp>

namespace bb {
namespace {

template <typename T>
concept Field2 = requires(T t) {
    t.c0;
    t.c1;
};

template <typename Packer> void pack_uint256(Packer& packer, const uint256_t& value)
{
    const uint64_t bin_data[4] = {
        htonll(value.data[3]), htonll(value.data[2]), htonll(value.data[1]), htonll(value.data[0])
    };
    packer.pack_bin(sizeof(bin_data));
    packer.pack_bin_body(reinterpret_cast<const char*>(bin_data), sizeof(bin_data));
}

template <typename Packer, typename Field> void pack_field(Packer& packer, const Field& value)
{
    if constexpr (Field2<Field>) {
        packer.pack_array(2);
        pack_uint256(packer, value.c0);
        pack_uint256(packer, value.c1);
    } else {
        pack_uint256(packer, value);
    }
}

template <typename Packer, typename Field> void pack_infinity_field(Packer& packer)
{
    constexpr uint256_t all_ones = {
        0xffffffffffffffffUL, 0xffffffffffffffffUL, 0xffffffffffffffffUL, 0xffffffffffffffffUL
    };
    if constexpr (Field2<Field>) {
        packer.pack_array(2);
        pack_uint256(packer, all_ones);
        pack_uint256(packer, all_ones);
    } else {
        pack_uint256(packer, all_ones);
    }
}

template <typename Packer, typename Element> void pack_affine_element(Packer& packer, const Element& element)
{
    packer.pack_map(2);
    packer.pack("x");
    if (element.is_point_at_infinity()) {
        pack_infinity_field<Packer, typename Element::Fq>(packer);
    } else {
        pack_field(packer, element.x);
    }
    packer.pack("y");
    if (element.is_point_at_infinity()) {
        pack_infinity_field<Packer, typename Element::Fq>(packer);
    } else {
        pack_field(packer, element.y);
    }
}

} // namespace

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
    msgpack::packer<msgpack::sbuffer> packer(buffer);
    packer.pack_map(13);
    packer.pack("bn254_fr_modulus");
    pack_uint256(packer, constants.bn254_fr_modulus);
    packer.pack("bn254_fq_modulus");
    pack_uint256(packer, constants.bn254_fq_modulus);
    packer.pack("bn254_g1_generator");
    pack_affine_element(packer, constants.bn254_g1_generator);
    packer.pack("bn254_g2_generator");
    pack_affine_element(packer, constants.bn254_g2_generator);
    packer.pack("grumpkin_fr_modulus");
    pack_uint256(packer, constants.grumpkin_fr_modulus);
    packer.pack("grumpkin_fq_modulus");
    pack_uint256(packer, constants.grumpkin_fq_modulus);
    packer.pack("grumpkin_g1_generator");
    pack_affine_element(packer, constants.grumpkin_g1_generator);
    packer.pack("secp256k1_fr_modulus");
    pack_uint256(packer, constants.secp256k1_fr_modulus);
    packer.pack("secp256k1_fq_modulus");
    pack_uint256(packer, constants.secp256k1_fq_modulus);
    packer.pack("secp256k1_g1_generator");
    pack_affine_element(packer, constants.secp256k1_g1_generator);
    packer.pack("secp256r1_fr_modulus");
    pack_uint256(packer, constants.secp256r1_fr_modulus);
    packer.pack("secp256r1_fq_modulus");
    pack_uint256(packer, constants.secp256r1_fq_modulus);
    packer.pack("secp256r1_g1_generator");
    pack_affine_element(packer, constants.secp256r1_g1_generator);

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
