/**
 * @file bbapi_ecc.cpp
 * @brief Implementation of elliptic curve command execution for the Barretenberg RPC API
 */
#include "barretenberg/bbapi/bbapi_ecc.hpp"

namespace bb::bbapi {

BbGrumpkinMul::Response BbGrumpkinMul::execute(BbRequest& request) &&
{
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    return { point * scalar };
}

BbGrumpkinAdd::Response BbGrumpkinAdd::execute(BbRequest& request) &&
{
    if (!point_a.on_curve()) {
        BBAPI_ERROR(request, "Input point_a must be on the curve");
    }
    if (!point_b.on_curve()) {
        BBAPI_ERROR(request, "Input point_b must be on the curve");
    }
    return { point_a + point_b };
}

BbGrumpkinBatchMul::Response BbGrumpkinBatchMul::execute(BbRequest& request) &&
{
    for (const auto& p : points) {
        if (!p.on_curve()) {
            BBAPI_ERROR(request, "Input point must be on the curve");
        }
    }
    auto output = grumpkin::g1::element::batch_mul_with_endomorphism(points, scalar);
    return { std::move(output) };
}

BbGrumpkinGetRandomFr::Response BbGrumpkinGetRandomFr::execute(BB_UNUSED BbRequest& request) &&
{
    return { bb::fr::random_element() };
}

BbGrumpkinReduce512::Response BbGrumpkinReduce512::execute(BB_UNUSED BbRequest& request) &&
{
    auto bigint_input = from_buffer<uint512_t>(input.data());
    uint512_t barretenberg_modulus(bb::fr::modulus);
    uint512_t target_output = bigint_input % barretenberg_modulus;
    return { bb::fr(target_output.lo) };
}

BbSecp256k1Mul::Response BbSecp256k1Mul::execute(BbRequest& request) &&
{
    if (!point.on_curve()) {
        BBAPI_ERROR(request, "Input point must be on the curve");
    }
    return { point * scalar };
}

BbSecp256k1GetRandomFr::Response BbSecp256k1GetRandomFr::execute(BB_UNUSED BbRequest& request) &&
{
    return { secp256k1::fr::random_element() };
}

BbSecp256k1Reduce512::Response BbSecp256k1Reduce512::execute(BB_UNUSED BbRequest& request) &&
{
    auto bigint_input = from_buffer<uint512_t>(input.data());
    uint512_t secp256k1_modulus(secp256k1::fr::modulus);
    uint512_t target_output = bigint_input % secp256k1_modulus;
    return { secp256k1::fr(target_output.lo) };
}

BbBn254FrSqrt::Response BbBn254FrSqrt::execute(BB_UNUSED BbRequest& request) &&
{
    auto [is_sqr, root] = input.sqrt();
    return { is_sqr, root };
}

BbBn254FqSqrt::Response BbBn254FqSqrt::execute(BB_UNUSED BbRequest& request) &&
{
    auto [is_sqr, root] = input.sqrt();
    return { is_sqr, root };
}

BbBn254G1Mul::Response BbBn254G1Mul::execute(BbRequest& request) &&
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

BbBn254G2Mul::Response BbBn254G2Mul::execute(BbRequest& request) &&
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

BbBn254G1IsOnCurve::Response BbBn254G1IsOnCurve::execute(BB_UNUSED BbRequest& request) &&
{
    return { point.on_curve() };
}

BbBn254G1FromCompressed::Response BbBn254G1FromCompressed::execute(BbRequest& request) &&
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
