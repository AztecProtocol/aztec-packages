#pragma once
/**
 * @file bbapi_flavor_dispatch.hpp
 * @brief Flavor selection logic for stateful proving key operations.
 *
 * This file contains utilities to dispatch to the correct Ultra* flavor
 * based on ProofSystemSettings (oracle hash type, ZK mode, etc.).
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
 * @brief Enumeration of supported Ultra flavor types for stateful proving.
 * @details Each flavor represents a different proving system configuration.
 */
enum class UltraFlavorType : std::uint8_t {
    Ultra,         ///< Standard UltraHonk (non-ZK, Poseidon2)
    UltraZK,       ///< Zero-knowledge UltraHonk (Poseidon2)
    UltraKeccak,   ///< UltraHonk with Keccak hash (for EVM verification, non-ZK)
    UltraKeccakZK, ///< UltraHonk with Keccak hash (ZK variant)
    UltraRollup    ///< Rollup-optimized UltraHonk
};

/**
 * @brief Select the appropriate Ultra flavor based on proof system settings.
 * @param settings The proof system configuration (hash type, ZK mode, etc.)
 * @return The corresponding UltraFlavorType enum value
 *
 * @details Selection logic:
 *   - If oracle_hash_type == "keccak": UltraKeccak or UltraKeccakZK
 *   - If oracle_hash_type == "poseidon2": Ultra or UltraZK
 *   - UltraRollup is selected based on explicit flag (future extension)
 *   - disable_zk determines ZK vs non-ZK variant
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
