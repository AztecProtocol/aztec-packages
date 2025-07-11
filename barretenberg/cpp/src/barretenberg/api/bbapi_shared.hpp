#pragma once
/**
 * @file bbapi_shared.hpp
 * @brief Shared type definitions for the Barretenberg RPC API.
 *
 * This file contains common data structures used across multiple bbapi modules,
 * including circuit input types and proof system settings.
 */
#include "barretenberg/client_ivc/client_ivc.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include <cstdint>
#include <string>
#include <vector>

namespace bb::bbapi {

/**
 * @struct CircuitInputNoVK
 * @brief A circuit to be used in either ultrahonk or chonk (ClientIVC+honk) verification key derivation.
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
};

/**
 * @struct CircuitInput
 * @brief A circuit to be used in either ultrahonk or ClientIVC-honk proving.
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

    /**
     * @brief Honk recursion setting.
     * 0 = no recursion, 1 = UltraHonk recursion, 2 = UltraRollupHonk recursion.
     * Controls whether pairing point accumulators and IPA claims are added to public inputs.
     */
    uint32_t honk_recursion = 0;

    /**
     * @brief Flag to indicate if this circuit will be recursively verified.
     */
    bool recursive = false;
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

struct BBApiRequest {
    TraceSettings trace_settings{ AZTEC_TRACE_STRUCTURE };
    // Current depth of the IVC stack for this request
    uint32_t ivc_stack_depth = 0;
    std::shared_ptr<ClientIVC> ivc_in_progress;
    // Name of the last loaded circuit
    std::string last_circuit_name;
    // Store the parsed constraint system to get ahead of parsing before accumulate
    std::optional<acir_format::AcirFormat> last_circuit_constraints;
    // Store the verification key passed with the circuit
    std::vector<uint8_t> last_circuit_vk;
};

} // namespace bb::bbapi
