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

namespace bb::bbapi {

/**
 * @struct SchnorrComputePublicKey
 * @brief Compute Schnorr public key from private key
 */
struct SchnorrComputePublicKey {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SchnorrComputePublicKey";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SchnorrComputePublicKeyResponse";
        grumpkin::g1::affine_element public_key;
        SERIALIZATION_FIELDS(public_key);
        bool operator==(const Response&) const = default;
    };

    grumpkin::fr private_key;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(private_key);
    bool operator==(const SchnorrComputePublicKey&) const = default;
};

/**
 * @struct SchnorrConstructSignature
 * @brief Construct a Schnorr signature
 */
struct SchnorrConstructSignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SchnorrConstructSignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SchnorrConstructSignatureResponse";
        grumpkin::fr s;
        grumpkin::fr e;
        SERIALIZATION_FIELDS(s, e);
        bool operator==(const Response&) const = default;
    };

    grumpkin::fq message_field;
    grumpkin::fr private_key;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(message_field, private_key);
    bool operator==(const SchnorrConstructSignature&) const = default;
};

/**
 * @struct SchnorrVerifySignature
 * @brief Verify a Schnorr signature
 */
struct SchnorrVerifySignature {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SchnorrVerifySignature";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SchnorrVerifySignatureResponse";
        bool verified;
        SERIALIZATION_FIELDS(verified);
        bool operator==(const Response&) const = default;
    };

    grumpkin::fq message_field;
    grumpkin::g1::affine_element public_key;
    grumpkin::fr s;
    grumpkin::fr e;
    Response execute(BBApiRequest& request) &&;
    SERIALIZATION_FIELDS(message_field, public_key, s, e);
    bool operator==(const SchnorrVerifySignature&) const = default;
};

} // namespace bb::bbapi
