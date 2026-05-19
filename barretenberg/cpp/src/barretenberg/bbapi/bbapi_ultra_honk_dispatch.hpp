#pragma once

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/bbapi/bbapi_vk_validation.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include "barretenberg/honk/execution_trace/mega_execution_trace.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/special_public_inputs/special_public_inputs.hpp"
#include "barretenberg/stdlib_circuit_builders/ultra_circuit_builder.hpp"
#ifdef STARKNET_GARAGA_FLAVORS
#include "barretenberg/flavor/ultra_starknet_flavor.hpp"
#include "barretenberg/flavor/ultra_starknet_zk_flavor.hpp"
#endif
#include <string>
#include <type_traits>
#include <vector>

namespace bb::bbapi {

template <typename Flavor>
inline typename Flavor::Transcript::Proof concatenate_proof(const std::vector<uint256_t>& public_inputs,
                                                            const std::vector<uint256_t>& proof)
{
    using FF = typename Flavor::FF;
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

template <typename VK> std::vector<uint256_t> vk_to_uint256_fields(const VK& vk)
{
    auto fields = vk.to_field_elements();
    if constexpr (std::is_same_v<decltype(fields), std::vector<uint256_t>>) {
        return fields;
    } else {
        return std::vector<uint256_t>(fields.begin(), fields.end());
    }
}

inline void validate_rollup_settings(const ProofSystemSettings& settings)
{
    if (!settings.ipa_accumulation) {
        return;
    }

    if (settings.oracle_hash_type != "poseidon2") {
        throw_or_abort("Rollup circuits (ipa_accumulation=true) must use oracle_hash_type='poseidon2', got '" +
                       settings.oracle_hash_type + "'");
    }
}

template <typename Operation> auto dispatch_by_settings(const ProofSystemSettings& settings, Operation&& operation)
{
    if (settings.ipa_accumulation) {
        validate_rollup_settings(settings);
        return operation.template operator()<UltraFlavor, RollupIO>();
    }

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

    throw_or_abort("Invalid proof system settings: oracle_hash_type='" + settings.oracle_hash_type +
                   "', disable_zk=" + std::to_string(settings.disable_zk) +
                   ", ipa_accumulation=" + std::to_string(settings.ipa_accumulation));
}

} // namespace bb::bbapi
