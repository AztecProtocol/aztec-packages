#pragma once
/**
 * @file bbapi_shared.hpp
 * @brief Shared type definitions for the Barretenberg RPC API.
 *
 * This file contains common data structures used across multiple bbapi modules,
 * including circuit input types and proof system settings.
 */

#include "barretenberg/chonk/chonk.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include <cstdint>
#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @enum VkPolicy
 * @brief Policy for handling verification keys during IVC accumulation
 */
enum class VkPolicy {
    DEFAULT,  // Use the provided VK as-is (default behavior)
    CHECK,    // Verify the provided VK matches the computed VK, throw error if mismatch
    RECOMPUTE // Always ignore the provided VK and treat it as nullptr
};

/**
 * @struct CircuitInputNoVK
 * @brief A circuit to be used in either ultrahonk or chonk verification key derivation.
 */
struct CircuitInputNoVK {
    /**
     * @brief Human-readable name for the circuit
     *
     * This name is not used for processing but serves as a debugging aid and
     * provides context for circuit identification in logs and diagnostics.
     */
    std::string name;

    /**
     * @brief Serialized bytecode representation of the circuit
     *
     * Contains the ACIR program in serialized form. The format (bincode or msgpack)
     * is determined by examining the first byte of the bytecode.
     */
    std::vector<uint8_t> bytecode;

    MSGPACK_FIELDS(name, bytecode);
    bool operator==(const CircuitInputNoVK& other) const = default;
};

/**
 * @struct CircuitInput
 * @brief A circuit to be used in either ultrahonk or Chonk proving.
 */
struct CircuitInput {
    /**
     * @brief Human-readable name for the circuit
     *
     * This name is not used for processing but serves as a debugging aid and
     * provides context for circuit identification in logs and diagnostics.
     */
    std::string name;

    /**
     * @brief Serialized bytecode representation of the circuit
     *
     * Contains the ACIR program in serialized form. The format (bincode or msgpack)
     * is determined by examining the first byte of the bytecode.
     */
    std::vector<uint8_t> bytecode;

    /**
     * @brief Verification key of the circuit. This could be derived, but it is more efficient to have it fixed ahead of
     * time. As well, this guards against unexpected changes in the verification key.
     */
    std::vector<uint8_t> verification_key;

    MSGPACK_FIELDS(name, bytecode, verification_key);
    bool operator==(const CircuitInput& other) const = default;
};

struct ProofSystemSettings {
    /**
     * @brief Optional flag to indicate if the proof should be generated with IPA accumulation (i.e. for rollup
     * circuits).
     */
    bool ipa_accumulation = false;

    /**
     * @brief The oracle hash type to be used for the proof.
     *
     * This is used to determine the hash function used in the proof generation.
     * Valid values are "poseidon2", "keccak", and "starknet".
     */
    std::string oracle_hash_type = "poseidon2";

    /**
     * @brief Flag to disable blinding of the proof.
     * Useful for cases that don't require privacy, such as when all inputs are public or zk-SNARK proofs themselves.
     */
    bool disable_zk = false;

    // TODO(md): remove this once considered stable
    bool optimized_solidity_verifier = false;

    MSGPACK_FIELDS(ipa_accumulation, oracle_hash_type, disable_zk, optimized_solidity_verifier);
    bool operator==(const ProofSystemSettings& other) const = default;
};

/**
 * @brief Convert oracle hash type string to enum for internal use
 */
enum class OracleHashType { POSEIDON2, KECCAK, STARKNET };

inline OracleHashType parse_oracle_hash_type(const std::string& type)
{
    if (type == "keccak") {
        return OracleHashType::KECCAK;
    }
    if (type == "starknet") {
        return OracleHashType::STARKNET;
    }
    return OracleHashType::POSEIDON2; // default
}

/**
 * @brief Convert VK policy string to enum for internal use
 */
inline VkPolicy parse_vk_policy(const std::string& policy)
{
    if (policy == "check") {
        return VkPolicy::CHECK;
    }
    if (policy == "recompute") {
        return VkPolicy::RECOMPUTE;
    }
    return VkPolicy::DEFAULT; // default
}

struct BBApiRequest {
    // Current depth of the IVC stack for this request
    uint32_t ivc_stack_depth = 0;
    std::shared_ptr<IVCBase> ivc_in_progress;
    // Name of the last loaded circuit
    std::string loaded_circuit_name;
    // Store the parsed constraint system to get ahead of parsing before accumulate
    std::optional<acir_format::AcirFormat> loaded_circuit_constraints;
    // Store the verification key passed with the circuit
    std::vector<uint8_t> loaded_circuit_vk;
    // Policy for handling verification keys during accumulation
    VkPolicy vk_policy = VkPolicy::DEFAULT;
    // Error message - empty string means no error
    std::string error_message;
};

/**
 * @brief Error response returned when a command fails
 */
struct ErrorResponse {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ErrorResponse";
    std::string message;
    MSGPACK_FIELDS(message);
    bool operator==(const ErrorResponse&) const = default;
};

/**
 * @brief Macro to set error in BBApiRequest and return default response
 */
#define BBAPI_ERROR(request, msg)                                                                                      \
    do {                                                                                                               \
        (request).error_message = (msg);                                                                               \
        return {};                                                                                                     \
    } while (0)

struct Shutdown {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "Shutdown";
    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "ShutdownResponse";
        // Empty response - success indicated by no exception
        void msgpack(auto&& pack_fn) { pack_fn(); }
        bool operator==(const Response&) const = default;
    };
    void msgpack(auto&& pack_fn) { pack_fn(); }
    Response execute(const BBApiRequest&) && { return {}; }
    bool operator==(const Shutdown&) const = default;
};

} // namespace bb::bbapi
