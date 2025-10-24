/**
 * @file bbapi_ecc.cpp
 * @brief Implementation of elliptic curve command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_ecc.hpp"

namespace bb::bbapi {

GrumpkinMul::Response GrumpkinMul::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { point * scalar };
}

GrumpkinAdd::Response GrumpkinAdd::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { point_a + point_b };
}

GrumpkinBatchMul::Response GrumpkinBatchMul::execute(BB_UNUSED BBApiRequest& request) &&
{
    auto output = grumpkin::g1::element::batch_mul_with_endomorphism(points, scalar);
    return { std::move(output) };
}

GrumpkinGetRandomFr::Response GrumpkinGetRandomFr::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { bb::fr::random_element() };
}

GrumpkinReduce512::Response GrumpkinReduce512::execute(BB_UNUSED BBApiRequest& request) &&
{
    auto bigint_input = from_buffer<uint512_t>(input.data());
    uint512_t barretenberg_modulus(bb::fr::modulus);
    uint512_t target_output = bigint_input % barretenberg_modulus;
    return { bb::fr(target_output.lo) };
}

Secp256k1Mul::Response Secp256k1Mul::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { point * scalar };
}

Secp256k1GetRandomFr::Response Secp256k1GetRandomFr::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { secp256k1::fr::random_element() };
}

Secp256k1Reduce512::Response Secp256k1Reduce512::execute(BB_UNUSED BBApiRequest& request) &&
{
    auto bigint_input = from_buffer<uint512_t>(input.data());
    uint512_t secp256k1_modulus(secp256k1::fr::modulus);
    uint512_t target_output = bigint_input % secp256k1_modulus;
    return { secp256k1::fr(target_output.lo) };
}

Bn254FrSqrt::Response Bn254FrSqrt::execute(BB_UNUSED BBApiRequest& request) &&
{
    auto [is_sqr, root] = input.sqrt();
    return { is_sqr, root };
}

Bn254G1Mul::Response Bn254G1Mul::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { point * scalar };
}

Bn254G2Mul::Response Bn254G2Mul::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { point * scalar };
}

Bn254G1IsOnCurve::Response Bn254G1IsOnCurve::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { point.on_curve() };
}

Bn254GetCurveConstants::Response Bn254GetCurveConstants::execute(BB_UNUSED BBApiRequest& request) &&
{
    // Convert moduli to byte arrays (big-endian)
    std::array<uint8_t, 32> fr_mod_bytes;
    std::array<uint8_t, 32> fq_mod_bytes;

    // Manually copy modulus bytes (big-endian order)
    // Fr modulus
    for (size_t i = 0; i < 4; ++i) {
        uint64_t limb = bb::fr::modulus.data[3 - i]; // big-endian: write MSB first
        for (size_t j = 0; j < 8; ++j) {
            fr_mod_bytes[i * 8 + j] = static_cast<uint8_t>(limb >> (56 - j * 8));
        }
    }

    // Fq modulus
    for (size_t i = 0; i < 4; ++i) {
        uint64_t limb = bb::fq::modulus.data[3 - i]; // big-endian: write MSB first
        for (size_t j = 0; j < 8; ++j) {
            fq_mod_bytes[i * 8 + j] = static_cast<uint8_t>(limb >> (56 - j * 8));
        }
    }

    return { fr_mod_bytes, fq_mod_bytes, bb::g1::affine_element(bb::g1::one), bb::g2::affine_element(bb::g2::one) };
}

} // namespace bb::bbapi
