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
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct Poseidon2Hash
 * @brief Compute Poseidon2 hash of input field elements
 */
struct Poseidon2Hash {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2Hash";

    /**
     * @struct Response
     * @brief Contains the computed hash
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2HashResponse";

        /** @brief Hash result (32 bytes - field element) */
        std::vector<uint8_t> hash;
        MSGPACK_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    /** @brief Input field elements (each 32 bytes) */
    std::vector<std::vector<uint8_t>> inputs;

    Response execute(BBApiRequest& request) &&;
    MSGPACK_FIELDS(inputs);
    bool operator==(const Poseidon2Hash&) const = default;
};

} // namespace bb::bbapi
