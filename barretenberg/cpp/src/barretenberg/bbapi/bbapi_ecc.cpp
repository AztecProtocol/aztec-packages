/**
 * @file bbapi_ecc.cpp
 * @brief Implementation of elliptic curve command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_ecc.hpp"

namespace bb::bbapi {

GrumpkinMul::Response GrumpkinMul::execute(BBApiRequest& request) &&
{
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        BBAPI_ERROR(request, "Output point must be on the curve");
    }
    return { result };
}

GrumpkinAdd::Response GrumpkinAdd::execute(BBApiRequest& request) &&
{
    if (!point_a.on_curve()) {
        BBAPI_ERROR(request, "Input point_a must be on the curve");
    }
    if (!point_b.on_curve()) {
        BBAPI_ERROR(request, "Input point_b must be on the curve");
    }
    auto result = point_a + point_b;
    if (!result.on_curve()) {
        BBAPI_ERROR(request, "Output point must be on the curve");
    }
    return { result };
}

GrumpkinBatchMul::Response GrumpkinBatchMul::execute(BBApiRequest& request) &&
{
    for (const auto& p : points) {
        if (!p.on_curve()) {
            BBAPI_ERROR(request, "Input point must be on the curve");
        }
    }
    auto output = grumpkin::g1::element::batch_mul_with_endomorphism(points, scalar);
    for (const auto& p : output) {
        if (!p.on_curve()) {
            BBAPI_ERROR(request, "Output point must be on the curve");
        }
    }
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

Secp256k1Mul::Response Secp256k1Mul::execute(BBApiRequest& request) &&
{
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        BBAPI_ERROR(request, "Output point must be on the curve");
    }
    return { result };
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

Bn254FqSqrt::Response Bn254FqSqrt::execute(BB_UNUSED BBApiRequest& request) &&
{
    auto [is_sqr, root] = input.sqrt();
    return { is_sqr, root };
}

Bn254G1Mul::Response Bn254G1Mul::execute(BBApiRequest& request) &&
{
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        BBAPI_ERROR(request, "Output point must be on the curve");
    }
    return { result };
}

Bn254G2Mul::Response Bn254G2Mul::execute(BBApiRequest& request) &&
{
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    auto result = point * scalar;
    if (!result.on_curve()) {
        BBAPI_ERROR(request, "Output point must be on the curve");
    }
    return { result };
}

Bn254G1IsOnCurve::Response Bn254G1IsOnCurve::execute(BB_UNUSED BBApiRequest& request) &&
{
    return { point.on_curve() };
}

Bn254G1FromCompressed::Response Bn254G1FromCompressed::execute(BBApiRequest& request) &&
{
    // Convert 32-byte array to uint256_t
    uint256_t compressed_value = from_buffer<uint256_t>(compressed.data());
    // Decompress the point
    auto point = bb::g1::affine_element::from_compressed(compressed_value);
    // Verify the decompressed point is on the curve
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Decompressed point is not on the curve");
    }
    return { point };
}

} // namespace bb::bbapi
