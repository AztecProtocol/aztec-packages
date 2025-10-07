#pragma once
/**
 * @file bbapi_crypto.hpp
 * @brief Cryptographic primitive commands for the Barretenberg RPC API.
 *
 * This file contains command structures for direct access to cryptographic
 * primitives like hash functions.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <vector>

namespace bb::bbapi {

/**
 * @struct Poseidon2Hash
 * @brief Computes a Poseidon2 hash over BN254 scalar field elements.
 *
 * This command provides direct access to the Poseidon2 hash function,
 * which is useful for testing, debugging, and simple hash operations.
 */
struct Poseidon2Hash {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2Hash";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "Poseidon2HashResponse";

        uint256_t hash; // Field element hash result
        MSGPACK_FIELDS(hash);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint256_t> inputs; // Field element inputs
    MSGPACK_FIELDS(inputs);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const Poseidon2Hash&) const = default;
};

} // namespace bb::bbapi
