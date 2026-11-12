#pragma once

#include "barretenberg/ecc/curves/bn254/fr.hpp"

#include <cstdint>
#include <span>
#include <string_view>
#include <vector>

namespace bb::bbapi {

struct AztecPrivateFunction {
    uint32_t selector;
    fr vk_hash;
};

/** @brief A contract class and the preimage of its id. */
struct AztecContractClass {
    fr artifact_hash;
    fr private_functions_root;
    fr public_bytecode_commitment;
    fr id;
    /** The leaves of the private functions tree, sorted by selector. */
    std::vector<AztecPrivateFunction> private_functions;
};

/**
 * @brief Derives the contract class of a contract artifact: the JSON nargo writes, with the private functions'
 *        verification keys added by `bb aztec_process`.
 */
AztecContractClass compute_aztec_contract_class(std::string_view artifact_json);

/**
 * @brief The nullifiers the genesis nullifier tree is seeded with: for each protocol contract, its class registration
 *        nullifier and its instance registration nullifier at its fixed address, sorted ascending.
 * @param artifacts_json The artifacts of ContractInstanceRegistry, ContractClassRegistry and FeeJuice, in any order.
 */
std::vector<fr> compute_aztec_protocol_genesis_nullifiers(std::span<const std::string_view> artifacts_json);

} // namespace bb::bbapi
