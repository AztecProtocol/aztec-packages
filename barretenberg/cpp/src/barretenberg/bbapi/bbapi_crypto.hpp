// === AUDIT STATUS ===
// internal:    { status: not started, auditors: [], commit: dd03c4a23ab067274b4964cacb36d1545f73fb14}
// external_1:  { status: not started, auditors: [], commit: }
// external_2:  { status: not started, auditors: [], commit: }
// =====================

#pragma once
/**
 * @file bbapi_crypto.hpp
 * @brief Cryptographic primitives command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for cryptographic operations including
 * Poseidon2, Pedersen, BbBlake2s, and AES.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/ecc/curves/bn254/fr.hpp"
#include "barretenberg/ecc/curves/grumpkin/grumpkin.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <array>
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct BbPoseidon2Hash
 * @brief Compute Poseidon2 hash of input field elements
 */
struct BbPoseidon2Hash {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPoseidon2Hash";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPoseidon2HashResponse";
        fr hash;
        SERIALIZATION_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<fr> inputs;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(inputs);
    bool operator==(const BbPoseidon2Hash&) const = default;
};

/**
 * @struct BbPoseidon2Permutation
 * @brief Compute Poseidon2 permutation on state (4 field elements)
 */
struct BbPoseidon2Permutation {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPoseidon2Permutation";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPoseidon2PermutationResponse";
        std::array<fr, 4> outputs;
        SERIALIZATION_FIELDS(outputs);
        bool operator==(const Response&) const = default;
    };

    std::array<fr, 4> inputs;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(inputs);
    bool operator==(const BbPoseidon2Permutation&) const = default;
};

/**
 * @struct BbPedersenCommit
 * @brief Compute Pedersen commitment to field elements
 */
struct BbPedersenCommit {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPedersenCommit";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPedersenCommitResponse";
        grumpkin::g1::affine_element point;
        SERIALIZATION_FIELDS(point);
        bool operator==(const Response&) const = default;
    };

    std::vector<grumpkin::fq> inputs;
    uint32_t hash_index;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(inputs, hash_index);
    bool operator==(const BbPedersenCommit&) const = default;
};

/**
 * @struct BbPedersenHash
 * @brief Compute Pedersen hash of field elements
 */
struct BbPedersenHash {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPedersenHash";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPedersenHashResponse";
        grumpkin::fq hash;
        SERIALIZATION_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<grumpkin::fq> inputs;
    uint32_t hash_index;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(inputs, hash_index);
    bool operator==(const BbPedersenHash&) const = default;
};

/**
 * @struct BbPedersenHashBuffer
 * @brief Compute Pedersen hash of raw buffer
 */
struct BbPedersenHashBuffer {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPedersenHashBuffer";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbPedersenHashBufferResponse";
        grumpkin::fq hash;
        SERIALIZATION_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> input;
    uint32_t hash_index;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(input, hash_index);
    bool operator==(const BbPedersenHashBuffer&) const = default;
};

/**
 * @struct BbBlake2s
 * @brief Compute BbBlake2s hash
 */
struct BbBlake2s {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbBlake2s";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbBlake2sResponse";
        std::array<uint8_t, 32> hash;
        SERIALIZATION_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> data;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(data);
    bool operator==(const BbBlake2s&) const = default;
};

/**
 * @struct BbBlake2sToField
 * @brief Compute BbBlake2s hash and convert to field element
 */
struct BbBlake2sToField {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbBlake2sToField";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbBlake2sToFieldResponse";
        fr field;
        SERIALIZATION_FIELDS(field);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> data;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(data);
    bool operator==(const BbBlake2sToField&) const = default;
};

/**
 * @struct BbAesEncrypt
 * @brief AES-128 CBC encryption
 */
struct BbAesEncrypt {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbAesEncrypt";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbAesEncryptResponse";
        std::vector<uint8_t> ciphertext;
        SERIALIZATION_FIELDS(ciphertext);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> plaintext;
    std::array<uint8_t, 16> iv;
    std::array<uint8_t, 16> key;
    uint32_t length;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(plaintext, iv, key, length);
    bool operator==(const BbAesEncrypt&) const = default;
};

/**
 * @struct BbAesDecrypt
 * @brief AES-128 CBC decryption
 */
struct BbAesDecrypt {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbAesDecrypt";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "BbAesDecryptResponse";
        std::vector<uint8_t> plaintext;
        SERIALIZATION_FIELDS(plaintext);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> ciphertext;
    std::array<uint8_t, 16> iv;
    std::array<uint8_t, 16> key;
    uint32_t length;
    Response execute(BbRequest& request) &&;
    SERIALIZATION_FIELDS(ciphertext, iv, key, length);
    bool operator==(const BbAesDecrypt&) const = default;
};

} // namespace bb::bbapi
