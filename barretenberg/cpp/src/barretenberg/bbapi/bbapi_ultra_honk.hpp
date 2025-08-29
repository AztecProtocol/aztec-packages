#pragma once
/**
 * @file bbapi_ultra_honk.hpp
 * @brief UltraHonk-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for UltraHonk proof system operations
 * including circuit proving, verification, VK computation, and utility functions.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/common/named_union.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include <cstdint>
#include <map>
#include <vector>

namespace bb::bbapi {

struct CircuitComputeVk {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitComputeVk";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitComputeVkResponse";

        std::vector<uint8_t> bytes;    // Serialized verification key
        std::vector<uint256_t> fields; // VK as field elements (unless keccak, then just uint256_t's)
        std::vector<uint8_t> hash;     // The VK hash
        MSGPACK_FIELDS(bytes, fields, hash);
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitComputeVk&) const = default;
};

/**
 * @struct CircuitProve
 * @brief Represents a request to generate a proof.
 * Currently, UltraHonk is the only proving system supported by BB (after plonk was deprecated and removed).
 * This is used for one-shot proving, not our "IVC" scheme, ClientIVC-honk. For that, use the ClientIVC* commands.
 */
struct CircuitProve {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitProve";

    /**
     * @brief Contains proof and public inputs.
     * Both are given as vectors of fields. To be used for verification.
     * Example uses of this Response would be verification in native BB, WASM BB, solidity or recursively through Noir.
     */
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitProveResponse";

        std::vector<uint256_t> public_inputs;
        std::vector<uint256_t> proof;
        CircuitComputeVk::Response vk;
        MSGPACK_FIELDS(public_inputs, proof, vk);
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, witness, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitProve&) const = default;
};

/**
 * @struct CircuitStats
 * @brief Consolidated command for retrieving circuit information.
 * Combines gate count, circuit size, and other metadata into a single command.
 */
struct CircuitStats {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitStats";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitInfoResponse";

        uint32_t num_gates{};
        uint32_t num_gates_dyadic{};
        uint32_t num_acir_opcodes{};
        std::vector<size_t> gates_per_opcode;
        MSGPACK_FIELDS(num_gates, num_gates_dyadic, num_acir_opcodes, gates_per_opcode);
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    bool include_gates_per_opcode = false;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(circuit, include_gates_per_opcode, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitStats&) const = default;
};

/**
 * @struct CircuitVerify
 * @brief Verify a proof against a verification key and public inputs.
 */
struct CircuitVerify {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitVerify";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitVerifyResponse";

        bool verified;
        MSGPACK_FIELDS(verified);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    std::vector<uint256_t> public_inputs;
    std::vector<uint256_t> proof;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(verification_key, public_inputs, proof, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitVerify&) const = default;
};

/**
 * @struct VkAsFields
 * @brief Convert a verification key to field elements representation.
 * WORKTODO(bbapi): this should become mostly obsolete with having the verification keys always reported as field
elements as well,
 * and having a simpler serialization method.
 */
struct VkAsFields {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "VkAsFields";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "VkAsFieldsResponse";

        std::vector<bb::fr> fields;
        MSGPACK_FIELDS(fields);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    MSGPACK_FIELDS(verification_key);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const VkAsFields&) const = default;
};

/**
 * @brief Command to generate Solidity verifier contract
 */
struct CircuitWriteSolidityVerifier {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitWriteSolidityVerifier";

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "CircuitWriteSolidityVerifierResponse";

        std::string solidity_code;
        MSGPACK_FIELDS(solidity_code);
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    ProofSystemSettings settings;
    MSGPACK_FIELDS(verification_key, settings);
    Response execute(const BBApiRequest& request = {}) &&;
    bool operator==(const CircuitWriteSolidityVerifier&) const = default;
};

} // namespace bb::bbapi
