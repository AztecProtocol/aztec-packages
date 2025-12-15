#pragma once
/**
 * @file bbapi_flavor_dispatch.hpp
 * @brief Flavor selection for stateful proving key operations.
 */

#include "barretenberg/bbapi/bbapi_shared.hpp"
#include "barretenberg/flavor/ultra_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_flavor.hpp"
#include "barretenberg/flavor/ultra_keccak_zk_flavor.hpp"
#include "barretenberg/flavor/ultra_rollup_flavor.hpp"
#include "barretenberg/flavor/ultra_zk_flavor.hpp"
#include <cstdint>

namespace bb::bbapi {

/**
 * @brief Supported Ultra flavor types for stateful proving.
 */
enum class UltraFlavorType : std::uint8_t { Ultra, UltraZK, UltraKeccak, UltraKeccakZK, UltraRollup };

/**
 * @brief Select Ultra flavor based on proof system settings.
 */
inline UltraFlavorType select_ultra_flavor(const ProofSystemSettings& settings)
{
    // IPA accumulation takes precedence - this selects UltraRollup
    if (settings.ipa_accumulation) {
        return UltraFlavorType::UltraRollup;
    }

    // Keccak-based flavors (for EVM verification)
    if (settings.oracle_hash_type == "keccak") {
        return settings.disable_zk ? UltraFlavorType::UltraKeccak : UltraFlavorType::UltraKeccakZK;
    }

    // Poseidon2-based flavors (default)
    if (settings.oracle_hash_type == "poseidon2") {
        return settings.disable_zk ? UltraFlavorType::Ultra : UltraFlavorType::UltraZK;
    }

    // Default to Poseidon2 non-ZK if oracle_hash_type is unrecognized
    return settings.disable_zk ? UltraFlavorType::Ultra : UltraFlavorType::UltraZK;
}

} // namespace bb::bbapi
