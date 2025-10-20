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

} // namespace bb::bbapi
