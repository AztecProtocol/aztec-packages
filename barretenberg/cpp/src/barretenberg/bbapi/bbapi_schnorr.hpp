#pragma once
/**
 * @file bbapi_schnorr.hpp
 * @brief Schnorr signature command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for Schnorr signature operations
 * on the Grumpkin curve.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/crypto/schnorr/schnorr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct BbSchnorrComputePublicKey
 * @brief Compute Schnorr public key from private key
 */
struct BbSchnorrComputePublicKey {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbSchnorrComputePublicKey";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbSchnorrComputePublicKeyResponse";
        grumpkin::g1::affine_element public_key;
        SERIALIZATION_FIELDS(public_key);
        bool operator==(const Response&) const = default;
    };

    grumpkin::fr private_key;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(private_key);
    bool operator==(const BbSchnorrComputePublicKey&) const = default;
};

/**
 * @struct BbSchnorrConstructSignature
 * @brief Construct a Schnorr signature
 */
struct BbSchnorrConstructSignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbSchnorrConstructSignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbSchnorrConstructSignatureResponse";
        std::array<uint8_t, 32> s;
        std::array<uint8_t, 32> e;
        SERIALIZATION_FIELDS(s, e);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message; // Variable length
    grumpkin::fr private_key;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(message, private_key);
    bool operator==(const BbSchnorrConstructSignature&) const = default;
};

/**
 * @struct BbSchnorrVerifySignature
 * @brief Verify a Schnorr signature
 */
struct BbSchnorrVerifySignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbSchnorrVerifySignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbSchnorrVerifySignatureResponse";
        bool verified;
        SERIALIZATION_FIELDS(verified);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> message;
    grumpkin::g1::affine_element public_key;
    std::array<uint8_t, 32> s;
    std::array<uint8_t, 32> e;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(message, public_key, s, e);
    bool operator==(const BbSchnorrVerifySignature&) const = default;
};

} // namespace bb::bbapi
