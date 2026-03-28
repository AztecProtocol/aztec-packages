#pragma once
/**
 * @file bbapi_ecc.hpp
 * @brief Elliptic curve operations command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for elliptic curve operations including
 * Grumpkin, Secp256k1, and BN254 field operations.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/ecc/curves/bn254/bn254.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct BbGrumpkinMul
 * @brief Multiply a Grumpkin point by a scalar
 */
struct BbGrumpkinMul {

    struct Response {
        grumpkin::g1::affine_element point;
        bool operator==(const Response&) const = default;
    };

    grumpkin::g1::affine_element point;
    grumpkin::fr scalar;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbGrumpkinMul&) const = default;
};

/**
 * @struct BbGrumpkinAdd
 * @brief Add two Grumpkin points
 */
struct BbGrumpkinAdd {

    struct Response {
        grumpkin::g1::affine_element point;
        bool operator==(const Response&) const = default;
    };

    grumpkin::g1::affine_element point_a;
    grumpkin::g1::affine_element point_b;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbGrumpkinAdd&) const = default;
};

/**
 * @struct BbGrumpkinBatchMul
 * @brief Multiply multiple Grumpkin points by a single scalar
 */
struct BbGrumpkinBatchMul {

    struct Response {
        std::vector<grumpkin::g1::affine_element> points;
        bool operator==(const Response&) const = default;
    };

    std::vector<grumpkin::g1::affine_element> points;
    grumpkin::fr scalar;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbGrumpkinBatchMul&) const = default;
};

/**
 * @struct BbGrumpkinGetRandomFr
 * @brief Get a random Grumpkin field element (BN254 Fr)
 */
struct BbGrumpkinGetRandomFr {

    struct Response {
        bb::fr value;
        bool operator==(const Response&) const = default;
    };

    // Empty struct for commands with no input - use a dummy field for msgpack
    uint8_t dummy = 0;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbGrumpkinGetRandomFr&) const = default;
};

/**
 * @struct BbGrumpkinReduce512
 * @brief Reduce a 512-bit value modulo Grumpkin scalar field (BN254 Fr)
 */
struct BbGrumpkinReduce512 {

    struct Response {
        bb::fr value;
        bool operator==(const Response&) const = default;
    };

    std::array<uint8_t, 64> input;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbGrumpkinReduce512&) const = default;
};

/**
 * @struct BbSecp256k1Mul
 * @brief Multiply a Secp256k1 point by a scalar
 */
struct BbSecp256k1Mul {

    struct Response {
        secp256k1::g1::affine_element point;
        bool operator==(const Response&) const = default;
    };

    secp256k1::g1::affine_element point;
    secp256k1::fr scalar;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbSecp256k1Mul&) const = default;
};

/**
 * @struct BbSecp256k1GetRandomFr
 * @brief Get a random Secp256k1 field element
 */
struct BbSecp256k1GetRandomFr {

    struct Response {
        secp256k1::fr value;
        bool operator==(const Response&) const = default;
    };

    // Empty struct for commands with no input - use a dummy field for msgpack
    uint8_t dummy = 0;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbSecp256k1GetRandomFr&) const = default;
};

/**
 * @struct BbSecp256k1Reduce512
 * @brief Reduce a 512-bit value modulo Secp256k1 scalar field
 */
struct BbSecp256k1Reduce512 {

    struct Response {
        secp256k1::fr value;
        bool operator==(const Response&) const = default;
    };

    std::array<uint8_t, 64> input;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbSecp256k1Reduce512&) const = default;
};

/**
 * @struct BbBn254FrSqrt
 * @brief Compute square root of a BN254 Fr (scalar field) element
 */
struct BbBn254FrSqrt {

    struct Response {
        bool is_square_root;
        bb::fr value;
        bool operator==(const Response&) const = default;
    };

    bb::fr input;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbBn254FrSqrt&) const = default;
};

/**
 * @struct BbBn254FqSqrt
 * @brief Compute square root of a BN254 Fq (base field) element
 */
struct BbBn254FqSqrt {

    struct Response {
        bool is_square_root;
        bb::fq value;
        bool operator==(const Response&) const = default;
    };

    bb::fq input;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbBn254FqSqrt&) const = default;
};

/**
 * @struct BbBn254G1Mul
 * @brief Multiply a BN254 G1 point by a scalar
 */
struct BbBn254G1Mul {

    struct Response {
        bb::g1::affine_element point;
        bool operator==(const Response&) const = default;
    };

    bb::g1::affine_element point;
    bb::fr scalar;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbBn254G1Mul&) const = default;
};

/**
 * @struct BbBn254G2Mul
 * @brief Multiply a BN254 G2 point by a scalar
 */
struct BbBn254G2Mul {

    struct Response {
        bb::g2::affine_element point;
        bool operator==(const Response&) const = default;
    };

    bb::g2::affine_element point;
    bb::fr scalar;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbBn254G2Mul&) const = default;
};

/**
 * @struct BbBn254G1IsOnCurve
 * @brief Check if a BN254 G1 point is on the curve
 */
struct BbBn254G1IsOnCurve {

    struct Response {
        bool is_on_curve;
        bool operator==(const Response&) const = default;
    };

    bb::g1::affine_element point;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbBn254G1IsOnCurve&) const = default;
};

/**
 * @struct BbBn254G1FromCompressed
 * @brief Decompress a BN254 G1 point from compressed form
 */
struct BbBn254G1FromCompressed {

    struct Response {
        bb::g1::affine_element point;
        bool operator==(const Response&) const = default;
    };

    std::array<uint8_t, 32> compressed = {};
    Response execute(BbRequest& request) &&;
    bool operator==(const BbBn254G1FromCompressed&) const = default;
};

} // namespace bb::bbapi
