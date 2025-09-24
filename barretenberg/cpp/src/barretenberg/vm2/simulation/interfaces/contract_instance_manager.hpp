#pragma once

#include <optional>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Core shared component for contract instance retrieval and validation
 *
 * This component provides shared logic for retrieving contract instances,
 * validating their existence with address derivation, nullifier checks, and update checking.
 * Used by both the GetContractInstance opcode and bytecode retrieval.
 */
class ContractInstanceManagerInterface {
  public:
    virtual ~ContractInstanceManagerInterface() = default;

    /**
     * @brief Retrieve and validate a contract instance
     * @param contract_address The address of the contract to retrieve
     * @return The contract instance if it exists, otherwise std::nullopt
     */
    virtual std::optional<ContractInstance> get_contract_instance(const FF& contract_address) = 0;
};

} // namespace bb::avm2::simulation
