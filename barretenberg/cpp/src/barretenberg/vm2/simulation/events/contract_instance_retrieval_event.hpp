#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

/**
 * Event emitted by the Contract Instance Manager for contract_instance_retrieval.pil gadget
 */
struct ContractInstanceRetrievalEvent {
    AztecAddress address = AztecAddress(0);
    ContractInstance contract_instance{};

    // Tree context
    FF nullifier_tree_root = FF(0);
    FF public_data_tree_root = FF(0);

    // Nullifier info
    FF deployment_nullifier = FF(0);
    bool exists;

    bool is_protocol_contract = false;

    bool operator==(const ContractInstanceRetrievalEvent& other) const = default;
};

} // namespace bb::avm2::simulation
