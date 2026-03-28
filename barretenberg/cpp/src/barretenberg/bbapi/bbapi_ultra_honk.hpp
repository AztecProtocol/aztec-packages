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
#include <cstdint>
#include <map>
#include <vector>

namespace bb::bbapi {

struct BbCircuitComputeVk {

    struct Response {

        std::vector<uint8_t> bytes;    // Serialized verification key
        std::vector<uint256_t> fields; // VK as field elements (unless keccak, then just uint256_t's)
        std::vector<uint8_t> hash;     // The VK hash
        bool operator==(const Response&) const = default;
    };

    CircuitInputNoVK circuit;
    ProofSystemSettings settings;
    Response execute(const BbRequest& request = {}) &&;
    bool operator==(const BbCircuitComputeVk&) const = default;
};

/**
 * @struct BbCircuitProve
 * @brief Represents a request to generate a proof.
 * Currently, UltraHonk is the only proving system supported by BB (after plonk was deprecated and removed).
 * This is used for one-shot proving, not our "IVC" scheme, Chonk. For that, use the Chonk*
 * commands.
 */
struct BbCircuitProve {

    /**
     * @brief Contains proof and public inputs.
     * Both are given as vectors of fields. To be used for verification.
     * Example uses of this Response would be verification in native BB, WASM BB, solidity or recursively through Noir.
     */
    struct Response {

        std::vector<uint256_t> public_inputs;
        std::vector<uint256_t> proof;
        BbCircuitComputeVk::Response vk;
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    Response execute(const BbRequest& request = {}) &&;
    bool operator==(const BbCircuitProve&) const = default;
};

/**
 * @struct BbCircuitStats
 * @brief Consolidated command for retrieving circuit information.
 * Combines gate count, circuit size, and other metadata into a single command.
 */
struct BbCircuitStats {

    struct Response {

        uint32_t num_gates{};
        uint32_t num_gates_dyadic{};
        uint32_t num_acir_opcodes{};
        std::vector<uint32_t> gates_per_opcode;
        bool operator==(const Response&) const = default;
    };

    CircuitInput circuit;
    bool include_gates_per_opcode = false;
    ProofSystemSettings settings;
    Response execute(const BbRequest& request = {}) &&;
    bool operator==(const BbCircuitStats&) const = default;
};

/**
 * @struct BbCircuitVerify
 * @brief Verify a proof against a verification key and public inputs.
 */
struct BbCircuitVerify {

    struct Response {

        bool verified;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    std::vector<uint256_t> public_inputs;
    std::vector<uint256_t> proof;
    ProofSystemSettings settings;
    Response execute(const BbRequest& request = {}) &&;
    bool operator==(const BbCircuitVerify&) const = default;
};

/**
 * @struct BbVkAsFields
 * @brief Convert a verification key to field elements representation.
 * WORKTODO(bbapi): this should become mostly obsolete with having the verification keys always reported as field
elements as well,
 * and having a simpler serialization method.
 */
struct BbVkAsFields {

    struct Response {

        std::vector<bb::fr> fields;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    Response execute(const BbRequest& request = {}) &&;
    bool operator==(const BbVkAsFields&) const = default;
};

/**
 * @struct BbMegaVkAsFields
 * @brief Convert a MegaFlavor verification key to field elements representation.
 * Used for private function verification keys which use MegaFlavor (127 fields).
 */
struct BbMegaVkAsFields {

    struct Response {

        std::vector<bb::fr> fields;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    Response execute(const BbRequest& request = {}) &&;
    bool operator==(const BbMegaVkAsFields&) const = default;
};

/**
 * @brief Command to generate Solidity verifier contract
 */
struct BbCircuitWriteSolidityVerifier {

    struct Response {

        std::string solidity_code;
        bool operator==(const Response&) const = default;
    };

    std::vector<uint8_t> verification_key;
    ProofSystemSettings settings;
    Response execute(const BbRequest& request = {}) &&;
    bool operator==(const BbCircuitWriteSolidityVerifier&) const = default;
};

} // namespace bb::bbapi
