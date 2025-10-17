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

} // namespace bb::bbapi
