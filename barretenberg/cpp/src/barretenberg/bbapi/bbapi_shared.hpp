#pragma once
/**
 * @file bbapi_shared.hpp
 * @brief Shared type definitions for the Barretenberg RPC API.
 *
 * This file contains shared state and helpers used across bbapi modules.
 */

#include "barretenberg/chonk/chonk.hpp"
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
#include <memory>
#include <optional>
#include <string>
#include <vector>

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
#ifndef __wasm__
    // Batch verifier service instance (persists across RPC calls)
    std::shared_ptr<ChonkBatchVerifierService> batch_verifier_service;
#endif
};

/**
 * @brief Macro to set error in BBApiRequest and return default response
 */
#define BBAPI_ERROR(request, msg)                                                                                      \
    do {                                                                                                               \
        (request).error_message = (msg);                                                                               \
        return {};                                                                                                     \
    } while (0)

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
template <typename Settings> inline void validate_rollup_settings(const Settings& settings)
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
template <typename Settings, typename Operation>
auto dispatch_by_settings(const Settings& settings, Operation&& operation)
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
