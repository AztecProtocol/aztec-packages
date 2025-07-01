#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct ContractInstanceRetrievalErrorEvent {
    AztecAddress address;
    bool error = false;
};

/**
 * @brief Event emitted by the Contract Instance Manager for contract_instance_retrieval.pil gadget
 *
 * This event follows the BytecodeRetrievalEvent pattern and contains all data needed
 * for the shared contract instance retrieval gadget. The contract address serves
 * as the unique identifier for each retrieval.
 */
struct ContractInstanceRetrievalEvent {
    AztecAddress address; // serves as unique identifier
    ContractInstance contract_instance;

    // State context
    FF nullifier_tree_root;
    FF public_data_tree_root;
    uint64_t timestamp;

    // Nullifier info
    FF deployment_nullifier;
    bool nullifier_exists;
    AztecAddress deployer_protocol_contract_address;

    bool error = false;

    bool operator==(const ContractInstanceRetrievalEvent& other) const = default;
};

} // namespace bb::avm2::simulation
