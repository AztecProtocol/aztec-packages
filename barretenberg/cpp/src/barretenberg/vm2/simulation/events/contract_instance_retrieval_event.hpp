#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

/**
 * Event emitted by the Contract Instance Manager for contract_instance_retrieval.pil gadget
 */
struct ContractInstanceRetrievalEvent {
    AztecAddress address;
    ContractInstance contract_instance;

    // Tree context
    FF nullifier_tree_root;
    FF public_data_tree_root;

    // Nullifier info
    FF deployment_nullifier;
    bool nullifier_exists;
    AztecAddress deployer_protocol_contract_address;

    bool error = false;

    bool operator==(const ContractInstanceRetrievalEvent& other) const = default;
};

} // namespace bb::avm2::simulation
