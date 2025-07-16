#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/address_derivation.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_retrieval_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/update_check.hpp"

namespace bb::avm2::simulation {

struct ContractInstanceNotFoundError : public std::runtime_error {
    ContractInstanceNotFoundError(AztecAddress address, const std::string& message)
        : std::runtime_error(message)
        , address(address)
    {}

    AztecAddress address;
};

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

class ContractInstanceManager : public ContractInstanceManagerInterface {
  public:
    ContractInstanceManager(ContractDBInterface& contract_db,
                            HighLevelMerkleDBInterface& merkle_db,
                            UpdateCheckInterface& update_check,
                            EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter);

    std::optional<ContractInstance> get_contract_instance(const FF& contract_address) override;

  private:
    ContractDBInterface& contract_db;
    HighLevelMerkleDBInterface& merkle_db;
    UpdateCheckInterface& update_check;
    EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter;
};

} // namespace bb::avm2::simulation
