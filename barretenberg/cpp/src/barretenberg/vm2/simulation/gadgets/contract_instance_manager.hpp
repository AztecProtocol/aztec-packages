#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_retrieval_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/address_derivation.hpp"
#include "barretenberg/vm2/simulation/gadgets/update_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/contract_instance_manager.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2::simulation {

struct ContractInstanceNotFoundError : public std::runtime_error {
    ContractInstanceNotFoundError(AztecAddress address, const std::string& message)
        : std::runtime_error(message)
        , address(address)
    {}

    AztecAddress address;
};

class ContractInstanceManager : public ContractInstanceManagerInterface {
  public:
    ContractInstanceManager(ContractDBInterface& contract_db,
                            HighLevelMerkleDBInterface& merkle_db,
                            UpdateCheckInterface& update_check,
                            FieldGreaterThanInterface& ff_gt,
                            const ProtocolContracts& protocol_contracts,
                            EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter);

    std::optional<ContractInstance> get_contract_instance(const FF& contract_address) override;

  private:
    ContractDBInterface& contract_db;
    HighLevelMerkleDBInterface& merkle_db;
    UpdateCheckInterface& update_check;
    const ProtocolContracts& protocol_contracts;
    FieldGreaterThanInterface& ff_gt;
    EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter;
};

} // namespace bb::avm2::simulation
