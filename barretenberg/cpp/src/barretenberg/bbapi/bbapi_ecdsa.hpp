#pragma once
/**
 * @file bbapi_ecdsa.hpp
 * @brief ECDSA signature command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for ECDSA signature operations
 * on Secp256k1 and Secp256r1 curves.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/crypto/ecdsa/ecdsa.hpp"
#include "barretenberg/ecc/curves/secp256k1/secp256k1.hpp"
#include "barretenberg/ecc/curves/secp256r1/secp256r1.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @struct EcdsaSecp256k1ComputePublicKey
 * @brief Compute ECDSA public key from private key for secp256k1
 */
struct EcdsaSecp256k1ComputePublicKey {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1ComputePublicKey";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1ComputePublicKeyResponse";
        secp256k1::g1::affine_element public_key;
        MSGPACK_FIELDS(public_key);
        bool operator==(const Response&) const = default;
    };

    secp256k1::fr private_key;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(private_key);
    bool operator==(const EcdsaSecp256k1ComputePublicKey&) const = default;
};

/**
 * @struct EcdsaSecp256r1ComputePublicKey
 * @brief Compute ECDSA public key from private key for secp256r1
 */
struct EcdsaSecp256r1ComputePublicKey {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1ComputePublicKey";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1ComputePublicKeyResponse";
        secp256r1::g1::affine_element public_key;
        MSGPACK_FIELDS(public_key);
        bool operator==(const Response&) const = default;
    };

    secp256r1::fr private_key;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(private_key);
    bool operator==(const EcdsaSecp256r1ComputePublicKey&) const = default;
};

/**
 * @struct EcdsaSecp256k1ConstructSignature
 * @brief Construct an ECDSA signature for secp256k1
 */
struct EcdsaSecp256k1ConstructSignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1ConstructSignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1ConstructSignatureResponse";
        std::array<uint8_t, 32> r;
        std::array<uint8_t, 32> s;
        uint8_t v;
        MSGPACK_FIELDS(r, s, v);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256k1::fr private_key;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(message, private_key);
    bool operator==(const EcdsaSecp256k1ConstructSignature&) const = default;
};

/**
 * @struct EcdsaSecp256r1ConstructSignature
 * @brief Construct an ECDSA signature for secp256r1
 */
struct EcdsaSecp256r1ConstructSignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1ConstructSignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1ConstructSignatureResponse";
        std::array<uint8_t, 32> r;
        std::array<uint8_t, 32> s;
        uint8_t v;
        MSGPACK_FIELDS(r, s, v);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256r1::fr private_key;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(message, private_key);
    bool operator==(const EcdsaSecp256r1ConstructSignature&) const = default;
};

/**
 * @struct EcdsaSecp256k1RecoverPublicKey
 * @brief Recover public key from ECDSA signature for secp256k1
 */
struct EcdsaSecp256k1RecoverPublicKey {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1RecoverPublicKey";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1RecoverPublicKeyResponse";
        secp256k1::g1::affine_element public_key;
        MSGPACK_FIELDS(public_key);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(message, r, s, v);
    bool operator==(const EcdsaSecp256k1RecoverPublicKey&) const = default;
};

/**
 * @struct EcdsaSecp256r1RecoverPublicKey
 * @brief Recover public key from ECDSA signature for secp256r1
 */
struct EcdsaSecp256r1RecoverPublicKey {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1RecoverPublicKey";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1RecoverPublicKeyResponse";
        secp256r1::g1::affine_element public_key;
        MSGPACK_FIELDS(public_key);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(message, r, s, v);
    bool operator==(const EcdsaSecp256r1RecoverPublicKey&) const = default;
};

/**
 * @struct EcdsaSecp256k1VerifySignature
 * @brief Verify an ECDSA signature for secp256k1
 */
struct EcdsaSecp256k1VerifySignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1VerifySignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256k1VerifySignatureResponse";
        bool verified;
        MSGPACK_FIELDS(verified);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256k1::g1::affine_element public_key;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(message, public_key, r, s, v);
    bool operator==(const EcdsaSecp256k1VerifySignature&) const = default;
};

/**
 * @struct EcdsaSecp256r1VerifySignature
 * @brief Verify an ECDSA signature for secp256r1
 */
struct EcdsaSecp256r1VerifySignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1VerifySignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "EcdsaSecp256r1VerifySignatureResponse";
        bool verified;
        MSGPACK_FIELDS(verified);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256r1::g1::affine_element public_key;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(message, public_key, r, s, v);
    bool operator==(const EcdsaSecp256r1VerifySignature&) const = default;
};

} // namespace bb::bbapi
