#pragma once
/**
 * @file bbapi_crypto.hpp
 * @brief Cryptographic primitives command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for cryptographic operations including
 * Poseidon2, Pedersen, Blake2s, and AES.
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
 * @struct Poseidon2Hash
 * @brief Compute Poseidon2 hash of input field elements
 */
struct Poseidon2Hash {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2Hash";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2HashResponse";
        fr hash;
        MSGPACK_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<fr> inputs;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(inputs);
    bool operator==(const Poseidon2Hash&) const = default;
};

/**
 * @struct Poseidon2Permutation
 * @brief Compute Poseidon2 permutation on state (4 field elements)
 */
struct Poseidon2Permutation {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2Permutation";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2PermutationResponse";
        std::array<fr, 4> outputs;
        MSGPACK_FIELDS(outputs);
        bool operator==(const Response&) const = default;
    };

    std::array<fr, 4> inputs;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(inputs);
    bool operator==(const Poseidon2Permutation&) const = default;
};

/**
 * @struct Poseidon2HashAccumulate
 * @brief Compute accumulated Poseidon2 hash
 */
struct Poseidon2HashAccumulate {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2HashAccumulate";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2HashAccumulateResponse";
        fr hash;
        MSGPACK_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<fr> inputs;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(inputs);
    bool operator==(const Poseidon2HashAccumulate&) const = default;
};

/**
 * @struct PedersenCommit
 * @brief Compute Pedersen commitment to field elements
 */
struct PedersenCommit {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "PedersenCommit";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "PedersenCommitResponse";
        grumpkin::g1::affine_element point;
        MSGPACK_FIELDS(point);
        bool operator==(const Response&) const = default;
    };

    std::vector<grumpkin::fq> inputs;
    uint32_t hash_index;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(inputs, hash_index);
    bool operator==(const PedersenCommit&) const = default;
};

/**
 * @struct PedersenHash
 * @brief Compute Pedersen hash of field elements
 */
struct PedersenHash {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "PedersenHash";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "PedersenHashResponse";
        grumpkin::fq hash;
        MSGPACK_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<grumpkin::fq> inputs;
    uint32_t hash_index;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(inputs, hash_index);
    bool operator==(const PedersenHash&) const = default;
};

/**
 * @struct PedersenHashBuffer
 * @brief Compute Pedersen hash of raw buffer
 */
struct PedersenHashBuffer {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "PedersenHashBuffer";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "PedersenHashBufferResponse";
        grumpkin::fq hash;
        MSGPACK_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> input;
    uint32_t hash_index;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(input, hash_index);
    bool operator==(const PedersenHashBuffer&) const = default;
};

/**
 * @struct Blake2s
 * @brief Compute Blake2s hash
 */
struct Blake2s {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Blake2s";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Blake2sResponse";
        std::array<uint8_t, 32> hash;
        MSGPACK_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> data;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(data);
    bool operator==(const Blake2s&) const = default;
};

/**
 * @struct Blake2sToField
 * @brief Compute Blake2s hash and convert to field element
 */
struct Blake2sToField {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Blake2sToField";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Blake2sToFieldResponse";
        fr field;
        MSGPACK_FIELDS(field);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> data;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(data);
    bool operator==(const Blake2sToField&) const = default;
};

/**
 * @struct AesEncrypt
 * @brief AES-128 CBC encryption
 */
struct AesEncrypt {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AesEncrypt";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AesEncryptResponse";
        std::vector<uint8_t> ciphertext;
        MSGPACK_FIELDS(ciphertext);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> plaintext;
    std::array<uint8_t, 16> iv;
    std::array<uint8_t, 16> key;
    uint32_t length;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(plaintext, iv, key, length);
    bool operator==(const AesEncrypt&) const = default;
};

/**
 * @struct AesDecrypt
 * @brief AES-128 CBC decryption
 */
struct AesDecrypt {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "AesDecrypt";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "AesDecryptResponse";
        std::vector<uint8_t> plaintext;
        MSGPACK_FIELDS(plaintext);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> ciphertext;
    std::array<uint8_t, 16> iv;
    std::array<uint8_t, 16> key;
    uint32_t length;
    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(ciphertext, iv, key, length);
    bool operator==(const AesDecrypt&) const = default;
};

} // namespace bb::bbapi
