#pragma once
/**
 * @file bbapi_ultra_honk.hpp
 * @brief UltraHonk-specific command definitions for the Barretenberg RPC API.
 *
 * This file contains command structures for UltraHonk proof system operations
 * including circuit proving, verification, VK computation, and utility functions.
 */
#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/honk/proof_system/types/proof.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include <cstdint>
#include <map>
#include <vector>

namespace bb::bbapi {

struct CircuitComputeVk {
    struct Response {

        std::vector<uint8_t> bytes;    // Serialized verification key
        std::vector<uint256_t> fields; // VK as field elements (unless keccak, then just uint256_t's)
        std::vector<uint8_t> hash;     // The VK hash
    };

    CircuitInputNoVK circuit;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct CircuitProve
 * @brief Represents a request to generate a proof.
 * Currently, UltraHonk is the only proving system supported by BB (after plonk was deprecated and removed).
 * This is used for one-shot proving, not our "IVC" scheme, Chonk. For that, use the Chonk*
 * commands.
 */
struct CircuitProve {
    /**
     * @brief Contains proof and public inputs.
     * Both are given as vectors of fields. To be used for verification.
     * Example uses of this Response would be verification in native BB, WASM BB, solidity or recursively through Noir.
     */
    struct Response {
        std::vector<uint256_t> public_inputs;
        std::vector<uint256_t> proof;
        CircuitComputeVk::Response vk;
    };

    CircuitInput circuit;
    std::vector<uint8_t> witness;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct CircuitStats
 * @brief Consolidated command for retrieving circuit information.
 * Combines gate count, circuit size, and other metadata into a single command.
 */
struct CircuitStats {
    struct Response {

        uint32_t num_gates{};
        uint32_t num_gates_dyadic{};
        uint32_t num_acir_opcodes{};
        std::vector<uint32_t> gates_per_opcode;
    };

    CircuitInput circuit;
    bool include_gates_per_opcode = false;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct CircuitVerify
 * @brief Verify a proof against a verification key and public inputs.
 */
struct CircuitVerify {
    struct Response {

        bool verified;
    };

    std::vector<uint8_t> verification_key;
    std::vector<uint256_t> public_inputs;
    std::vector<uint256_t> proof;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct VkAsFields
 * @brief Convert a verification key to field elements representation.
 * WORKTODO(bbapi): this should become mostly obsolete with having the verification keys always reported as field
elements as well,
 * and having a simpler serialization method.
 */
struct VkAsFields {
    struct Response {

        std::vector<bb::fr> fields;
    };

    std::vector<uint8_t> verification_key;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct MegaVkAsFields
 * @brief Convert a MegaFlavor verification key to field elements representation.
 * Used for private function verification keys which use MegaFlavor (127 fields).
 */
struct MegaVkAsFields {
    struct Response {

        std::vector<bb::fr> fields;
    };

    std::vector<uint8_t> verification_key;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct MegaAppVkAsFields
 * @brief Convert a MegaAppFlavor verification key to field elements.
 *
 * MegaAppFlavor drops the kernel/app-calldata read-side bus columns, producing a smaller VK than
 * MegaFlavor. Used for chonk-accumulated app circuits.
 */
struct MegaAppVkAsFields {
    struct Response {

        std::vector<bb::fr> fields;
    };

    std::vector<uint8_t> verification_key;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct MegaKernelVkAsFields
 * @brief Convert a MegaKernelFlavor verification key to field elements.
 *
 * MegaKernelFlavor drops LogDerivLookup and NonNativeField selectors compared to MegaFlavor.
 * Used for chonk-accumulated kernel circuits (init / inner / reset / tail).
 */
struct MegaKernelVkAsFields {
    struct Response {

        std::vector<bb::fr> fields;
    };

    std::vector<uint8_t> verification_key;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @struct MegaZKVkAsFields
 * @brief Convert a MegaZKFlavor verification key to field elements. Used for the IVC hiding kernel.
 */
struct MegaZKVkAsFields {
    struct Response {

        std::vector<bb::fr> fields;
    };

    std::vector<uint8_t> verification_key;
    Response execute(const BBApiRequest& request = {}) &&;
};

/**
 * @brief Command to generate Solidity verifier contract
 */
struct CircuitWriteSolidityVerifier {
    struct Response {

        std::string solidity_code;
    };

    std::vector<uint8_t> verification_key;
    ProofSystemSettings settings;
    Response execute(const BBApiRequest& request = {}) &&;
};

} // namespace bb::bbapi
