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
#include <array>
#include <cstdint>
#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @struct BbEcdsaSecp256k1ComputePublicKey
 * @brief Compute ECDSA public key from private key for secp256k1
 */
struct BbEcdsaSecp256k1ComputePublicKey {

    struct Response {
        secp256k1::g1::affine_element public_key;
        bool operator==(const Response&) const = default;
    };

    secp256k1::fr private_key;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256k1ComputePublicKey&) const = default;
};

/**
 * @struct BbEcdsaSecp256r1ComputePublicKey
 * @brief Compute ECDSA public key from private key for secp256r1
 */
struct BbEcdsaSecp256r1ComputePublicKey {

    struct Response {
        secp256r1::g1::affine_element public_key;
        bool operator==(const Response&) const = default;
    };

    secp256r1::fr private_key;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256r1ComputePublicKey&) const = default;
};

/**
 * @struct BbEcdsaSecp256k1ConstructSignature
 * @brief Construct an ECDSA signature for secp256k1
 */
struct BbEcdsaSecp256k1ConstructSignature {

    struct Response {
        std::array<uint8_t, 32> r;
        std::array<uint8_t, 32> s;
        uint8_t v;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256k1::fr private_key;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256k1ConstructSignature&) const = default;
};

/**
 * @struct BbEcdsaSecp256r1ConstructSignature
 * @brief Construct an ECDSA signature for secp256r1
 */
struct BbEcdsaSecp256r1ConstructSignature {

    struct Response {
        std::array<uint8_t, 32> r;
        std::array<uint8_t, 32> s;
        uint8_t v;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256r1::fr private_key;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256r1ConstructSignature&) const = default;
};

/**
 * @struct BbEcdsaSecp256k1RecoverPublicKey
 * @brief Recover public key from ECDSA signature for secp256k1
 */
struct BbEcdsaSecp256k1RecoverPublicKey {

    struct Response {
        secp256k1::g1::affine_element public_key;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256k1RecoverPublicKey&) const = default;
};

/**
 * @struct BbEcdsaSecp256r1RecoverPublicKey
 * @brief Recover public key from ECDSA signature for secp256r1
 */
struct BbEcdsaSecp256r1RecoverPublicKey {

    struct Response {
        secp256r1::g1::affine_element public_key;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256r1RecoverPublicKey&) const = default;
};

/**
 * @struct BbEcdsaSecp256k1VerifySignature
 * @brief Verify an ECDSA signature for secp256k1
 */
struct BbEcdsaSecp256k1VerifySignature {

    struct Response {
        bool verified;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256k1::g1::affine_element public_key;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256k1VerifySignature&) const = default;
};

/**
 * @struct BbEcdsaSecp256r1VerifySignature
 * @brief Verify an ECDSA signature for secp256r1
 */
struct BbEcdsaSecp256r1VerifySignature {

    struct Response {
        bool verified;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    secp256r1::g1::affine_element public_key;
    std::array<uint8_t, 32> r;
    std::array<uint8_t, 32> s;
    uint8_t v;
    Response execute(BbRequest& request) &&;
    bool operator==(const BbEcdsaSecp256r1VerifySignature&) const = default;
};

} // namespace bb::bbapi
