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
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct GrumpkinMul
 * @brief Multiply a Grumpkin point by a scalar
 */
struct GrumpkinMul {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinMul";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinMulResponse";
        grumpkin::g1::affine_element point;
        MSGPACK_FIELDS(point);
        bool operator==(const Response&) const = default;
    };

    grumpkin::g1::affine_element point;
    grumpkin::fr scalar;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(point, scalar);
    bool operator==(const GrumpkinMul&) const = default;
};

/**
 * @struct GrumpkinAdd
 * @brief Add two Grumpkin points
 */
struct GrumpkinAdd {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinAdd";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinAddResponse";
        grumpkin::g1::affine_element point;
        MSGPACK_FIELDS(point);
        bool operator==(const Response&) const = default;
    };

    grumpkin::g1::affine_element point_a;
    grumpkin::g1::affine_element point_b;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(point_a, point_b);
    bool operator==(const GrumpkinAdd&) const = default;
};

/**
 * @struct GrumpkinBatchMul
 * @brief Multiply multiple Grumpkin points by a single scalar
 */
struct GrumpkinBatchMul {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinBatchMul";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinBatchMulResponse";
        std::vector<grumpkin::g1::affine_element> points;
        MSGPACK_FIELDS(points);
        bool operator==(const Response&) const = default;
    };

    std::vector<grumpkin::g1::affine_element> points;
    grumpkin::fr scalar;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(points, scalar);
    bool operator==(const GrumpkinBatchMul&) const = default;
};

/**
 * @struct GrumpkinGetRandomFr
 * @brief Get a random Grumpkin field element (BN254 Fr)
 */
struct GrumpkinGetRandomFr {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinGetRandomFr";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinGetRandomFrResponse";
        bb::fr value;
        MSGPACK_FIELDS(value);
        bool operator==(const Response&) const = default;
    };

    // Empty struct for commands with no input - use a dummy field for msgpack
    uint8_t dummy = 0;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(dummy);
    bool operator==(const GrumpkinGetRandomFr&) const = default;
};

/**
 * @struct GrumpkinReduce512
 * @brief Reduce a 512-bit value modulo Grumpkin scalar field (BN254 Fr)
 */
struct GrumpkinReduce512 {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinReduce512";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "GrumpkinReduce512Response";
        bb::fr value;
        MSGPACK_FIELDS(value);
        bool operator==(const Response&) const = default;
    };

    std::array<uint8_t, 64> input;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(input);
    bool operator==(const GrumpkinReduce512&) const = default;
};

/**
 * @struct Secp256k1Mul
 * @brief Multiply a Secp256k1 point by a scalar
 */
struct Secp256k1Mul {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Secp256k1Mul";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Secp256k1MulResponse";
        secp256k1::g1::affine_element point;
        MSGPACK_FIELDS(point);
        bool operator==(const Response&) const = default;
    };

    secp256k1::g1::affine_element point;
    secp256k1::fr scalar;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(point, scalar);
    bool operator==(const Secp256k1Mul&) const = default;
};

/**
 * @struct Secp256k1GetRandomFr
 * @brief Get a random Secp256k1 field element
 */
struct Secp256k1GetRandomFr {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Secp256k1GetRandomFr";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Secp256k1GetRandomFrResponse";
        secp256k1::fr value;
        MSGPACK_FIELDS(value);
        bool operator==(const Response&) const = default;
    };

    // Empty struct for commands with no input - use a dummy field for msgpack
    uint8_t dummy = 0;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(dummy);
    bool operator==(const Secp256k1GetRandomFr&) const = default;
};

/**
 * @struct Secp256k1Reduce512
 * @brief Reduce a 512-bit value modulo Secp256k1 scalar field
 */
struct Secp256k1Reduce512 {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Secp256k1Reduce512";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Secp256k1Reduce512Response";
        secp256k1::fr value;
        MSGPACK_FIELDS(value);
        bool operator==(const Response&) const = default;
    };

    std::array<uint8_t, 64> input;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(input);
    bool operator==(const Secp256k1Reduce512&) const = default;
};

/**
 * @struct Bn254FrSqrt
 * @brief Compute square root of a BN254 field element
 */
struct Bn254FrSqrt {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Bn254FrSqrt";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Bn254FrSqrtResponse";
        bool is_square_root;
        bb::fr value;
        MSGPACK_FIELDS(is_square_root, value);
        bool operator==(const Response&) const = default;
    };

    bb::fr input;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(input);
    bool operator==(const Bn254FrSqrt&) const = default;
};

} // namespace bb::bbapi
