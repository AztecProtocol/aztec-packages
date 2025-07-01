#include "barretenberg/vm2/simulation/contract_instance_manager.hpp"
#include "barretenberg/crypto/poseidon2/poseidon2.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

using Poseidon2 = bb::crypto::Poseidon2<bb::crypto::Poseidon2Bn254ScalarFieldParams>;

namespace bb::avm2::simulation {

ContractInstanceManager::ContractInstanceManager(ContractDBInterface& contract_db,
                                                 HighLevelMerkleDBInterface& merkle_db,
                                                 UpdateCheckInterface& update_check,
                                                 EventEmitterInterface<ContractInstanceRetrievalEvent>& event_emitter,
                                                 const GlobalVariables& globals)
    : contract_db(contract_db)
    , merkle_db(merkle_db)
    , update_check(update_check)
    , event_emitter(event_emitter)
    , globals(globals)
{}

/**
 * @brief Retrieves a contract instance from the contract database.
 * If it has already been retrieved, just return it right away.
 * If it doesn't exist, just return empty.
 */
std::optional<ContractInstance> ContractInstanceManager::get_contract_instance(const FF& contract_address)
{
    // If the address has already been resolved, just return it right away.
    auto it = resolved_addresses.find(contract_address);
    if (it != resolved_addresses.end()) {
        return it->second;
    }

    // If the instance is found, the address derivation will be proven.
    // If it is not found, we have to prove that the nullifier does NOT exist.
    std::optional<ContractInstance> maybe_instance = contract_db.get_contract_instance(contract_address);

    // Note: skip canonical/magic address handling for now.
    // TODO(dbanks12): Add magic address handling and skip other checks if it is a magic address.

    if (!merkle_db.nullifier_exists(DEPLOYER_CONTRACT_ADDRESS, contract_address)) {
        resolved_addresses[contract_address] = std::nullopt;
        // TODO(dbanks12): store some bool to know that we already checked this one.
        // Emit error event
        event_emitter.emit({ .address = contract_address,
                             .contract_instance = {}, // Empty instance for error case
                             .nullifier_tree_root = 0,
                             .public_data_tree_root = 0,
                             .timestamp = 0,
                             .deployment_nullifier = 0,
                             .nullifier_exists = false,
                             .deployer_protocol_contract_address = AztecAddress{},
                             .error = true });

        return std::nullopt;
    }

    assert(maybe_instance.has_value() && "Contract instance should be found if nullifier exists");

    // Validate that the contract instance is the latest if there are any updates.
    const ContractInstance& instance = maybe_instance.value();
    update_check.check_current_class_id(contract_address, instance);

    // Get some current context
    uint64_t current_timestamp = globals.timestamp;
    FF current_public_data_tree_root = merkle_db.get_tree_roots().publicDataTree.root;
    FF current_nullifier_tree_root = merkle_db.get_tree_roots().nullifierTree.root;
    AztecAddress protocol_contract_address = AztecAddress(DEPLOYER_CONTRACT_ADDRESS);

    event_emitter.emit({ .address = contract_address,
                         .contract_instance = instance,
                         // State context
                         .nullifier_tree_root = current_nullifier_tree_root,
                         .public_data_tree_root = current_public_data_tree_root,
                         .timestamp = current_timestamp,
                         .deployer_protocol_contract_address = protocol_contract_address,
                         .error = false });

    return instance;
}

} // namespace bb::avm2::simulation
