#pragma once
/**
 * @file bbapi_shared.hpp
 * @brief Shared type definitions for the Barretenberg RPC API.
 *
 * This file contains common data structures used across multiple bbapi modules,
 * including circuit input types and proof system settings.
 */

#include "barretenberg/chonk/chonk_step_processor.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/dsl/acir_format/acir_format.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/stdlib/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/flavor/ultra_starknet_zk_flavor.hpp"
#endif
#include <cstdint>
#include <string>
#include <vector>

namespace bb::scalar_multiplication {
[[nodiscard]] bool use_legacy_msm() noexcept;
void set_legacy_msm_override(bool enabled) noexcept;
} // namespace bb::scalar_multiplication

namespace bb::bbapi {

/**
 * @brief Validate verification key size before deserialization
 * @tparam VK The verification key type
 * @param vk_bytes The serialized verification key bytes
 * @throws If the size doesn't match the expected size for the VK type
 */
template <typename VK> inline void validate_vk_size(const std::vector<uint8_t>& vk_bytes)
{
    const size_t expected_size = VK::calc_num_data_types() * sizeof(bb::fr);
    if (vk_bytes.size() != expected_size) {
        throw_or_abort("verification key has wrong size: expected " + std::to_string(expected_size) + ", got " +
                       std::to_string(vk_bytes.size()));
    }
}

/**
 * @enum VkPolicy
 * @brief Policy for handling verification keys during IVC accumulation
 */
enum class VkPolicy {
    DEFAULT,   // Use the provided VK as-is (default behavior)
    CHECK,     // Verify the provided VK matches the computed VK, throw error if mismatch
    RECOMPUTE, // Always ignore the provided VK and treat it as nullptr
    REWRITE    // Check the VK and rewrite the input file with correct VK if mismatch (for check command)
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

    SERIALIZATION_FIELDS(name, bytecode);
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

    SERIALIZATION_FIELDS(name, bytecode, verification_key);
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

    SERIALIZATION_FIELDS(ipa_accumulation, oracle_hash_type, disable_zk, optimized_solidity_verifier);
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
    if (policy == "rewrite") {
        return VkPolicy::REWRITE;
    }
    return VkPolicy::DEFAULT; // default
}

#ifndef __wasm__
// Forward declaration — defined in bbapi_chonk.hpp
class ChonkBatchVerifierService;
#endif

struct BBApiRequest {
    std::shared_ptr<ChonkStepProcessor> ivc_in_progress;
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
#ifndef __wasm__
    // Batch verifier service instance (persists across RPC calls)
    std::shared_ptr<ChonkBatchVerifierService> batch_verifier_service;
#endif
};

/**
 * @brief Error response returned when a command fails
 */
struct ErrorResponse {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "ErrorResponse";
    std::string message;
    SERIALIZATION_FIELDS(message);
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

struct SetMsmLegacy {
    static constexpr const char MSGPACK_SCHEMA_NAME[] = "SetMsmLegacy";
    bool enabled = false;

    struct Response {
        static constexpr const char MSGPACK_SCHEMA_NAME[] = "SetMsmLegacyResponse";
        bool enabled = false;
        SERIALIZATION_FIELDS(enabled);
        bool operator==(const Response&) const = default;
    };

    SERIALIZATION_FIELDS(enabled);
    Response execute(const BBApiRequest&) const
    {
        scalar_multiplication::set_legacy_msm_override(enabled);
        return { .enabled = scalar_multiplication::use_legacy_msm() };
    }
    bool operator==(const SetMsmLegacy&) const = default;
};

/**
 * @brief Concatenate public inputs and proof into a complete proof for verification
 * @details Joins the separated public_inputs and proof portions back together.
 * Handles implicit conversion from uint256_t to the flavor's DataType.
 *
 * The proof structure after concatenation is: [public_inputs | honk_proof (| ipa_proof)]
 * For rollup circuits (RollupIO), the proof portion includes the IPA proof appended at the end.
 * This must match the split done in _prove() and the verification in _verify().
 *
 * @param public_inputs The ACIR public inputs (user inputs, not including IO-specific data)
 * @param proof The proof data (Honk proof, plus IPA proof for rollup circuits)
 */
template <typename Flavor>
inline typename Flavor::Transcript::Proof concatenate_proof(const std::vector<uint256_t>& public_inputs,
                                                            const std::vector<uint256_t>& proof)
{
    using FF = typename Flavor::FF;
    // Reject non-canonical field encodings (values >= field modulus) to ensure consistent
    // verifier behavior across native and Solidity targets.
    for (const auto& val : public_inputs) {
        if (val >= FF::modulus) {
            throw_or_abort("Non-canonical public input: value >= field modulus");
        }
    }
    for (const auto& val : proof) {
        if (val >= FF::modulus) {
            throw_or_abort("Non-canonical proof element: value >= field modulus");
        }
    }
    typename Flavor::Transcript::Proof result;
    result.reserve(public_inputs.size() + proof.size());
    result.insert(result.end(), public_inputs.begin(), public_inputs.end());
    result.insert(result.end(), proof.begin(), proof.end());
    return result;
}

/**
 * @brief Convert VK to uint256 field elements, handling flavor-specific return types
 */
template <typename VK> std::vector<uint256_t> vk_to_uint256_fields(const VK& vk)
{
    auto fields = vk.to_field_elements();
    if constexpr (std::is_same_v<decltype(fields), std::vector<uint256_t>>) {
        return fields;
    } else {
        return std::vector<uint256_t>(fields.begin(), fields.end());
    }
}

/**
 * @brief Validate rollup circuit settings
 * @details Rollup circuits require poseidon2 oracle hash for efficient recursion.
 *          The disable_zk flag is ignored - rollup always uses UltraFlavor (non-ZK).
 *
 * @throws If oracle_hash_type is not poseidon2
 */
inline void validate_rollup_settings(const ProofSystemSettings& settings)
{
    if (!settings.ipa_accumulation) {
        return; // Not a rollup circuit, no validation needed
    }

    // Rollup circuits must use poseidon2 for efficient recursive verification
    if (settings.oracle_hash_type != "poseidon2") {
        throw_or_abort("Rollup circuits (ipa_accumulation=true) must use oracle_hash_type='poseidon2', got '" +
                       settings.oracle_hash_type + "'");
    }
}

/**
 * @brief Dispatch to the correct Flavor and IO type based on proof system settings
 * @details Maps settings (ipa_accumulation, oracle_hash_type, disable_zk) to the appropriate Flavor and IO template
 * parameters.
 *
 * Rollup Path:
 * - When ipa_accumulation=true, uses UltraFlavor with RollupIO (includes IPA claim for ECCVM)
 * - Validates that rollup settings are compatible (poseidon2, disable_zk=true)
 *
 * Non-Rollup Paths:
 * - Routes to appropriate Flavor based on oracle_hash_type and disable_zk
 * - Uses DefaultIO (includes only pairing points, no IPA)
 *
 * @param settings The proof system settings determining which flavor/IO to use
 * @param operation A callable object that will be invoked with <Flavor, IO> template parameters
 * @return The result of calling operation.template operator()<Flavor, IO>()
 *
 */
template <typename Operation> auto dispatch_by_settings(const ProofSystemSettings& settings, Operation&& operation)
{
    // Rollup circuits: UltraFlavor with RollupIO (includes IPA accumulation for ECCVM)
    if (settings.ipa_accumulation) {
        validate_rollup_settings(settings);
        return operation.template operator()<UltraFlavor, RollupIO>();
    }

    // Non-rollup circuits: route based on oracle hash type and ZK setting
    if (settings.oracle_hash_type == "poseidon2") {
        if (settings.disable_zk) {
            return operation.template operator()<UltraFlavor, DefaultIO>();
        }
        return operation.template operator()<UltraZKFlavor, DefaultIO>();
    }

    if (settings.oracle_hash_type == "keccak") {
        if (settings.disable_zk) {
            return operation.template operator()<UltraKeccakFlavor, DefaultIO>();
        }
        return operation.template operator()<UltraKeccakZKFlavor, DefaultIO>();
    }

#ifdef STARKNET_GARAGA_FLAVORS
    if (settings.oracle_hash_type == "starknet") {
        if (settings.disable_zk) {
            return operation.template operator()<UltraStarknetFlavor, DefaultIO>();
        }
        return operation.template operator()<UltraStarknetZKFlavor, DefaultIO>();
    }
#endif

    // Invalid configuration
    throw_or_abort("Invalid proof system settings: oracle_hash_type='" + settings.oracle_hash_type +
                   "', disable_zk=" + std::to_string(settings.disable_zk) +
                   ", ipa_accumulation=" + std::to_string(settings.ipa_accumulation));
}

} // namespace bb::bbapi
