#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/generated/relations/lookups_contract_instance_retrieval.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process the contract instance retrieval events and populate the relevant columns in the trace.
 *
 * Events are emitted in the following flavors:
 * - Protocol contract: is_protocol_contract=true, exists depends on derived address lookup,
 *   deployment_nullifier is not set (default 0).
 * - Non-existent contract: exists=false, is_protocol_contract=false, empty contract instance,
 *   deployment_nullifier=contract_address.
 * - Existing contract: exists=true, is_protocol_contract=false, full contract instance populated,
 *   deployment_nullifier=contract_address.
 *
 * @param events Container of ContractInstanceRetrievalEvent to process.
 * @param trace The trace container to populate.
 */
void ContractInstanceRetrievalTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ContractInstanceRetrievalEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    // Set the selector to 0 at row 0 to enable skippable gadget
    trace.set(C::contract_instance_retrieval_sel, 0, 0);

    uint32_t row = 1;
    for (const auto& event : events) {
        AztecAddress derived_address = event.address;
        FF protocol_contract_derived_address = 0;
        uint32_t derived_address_pi_index = 0;

        if (event.is_protocol_contract) {
            derived_address = event.exists ? simulation::compute_contract_address(event.contract_instance) : 0;
            protocol_contract_derived_address = derived_address;
            derived_address_pi_index =
                AVM_PUBLIC_INPUTS_PROTOCOL_CONTRACTS_ROW_IDX + static_cast<uint32_t>(event.address - 1);
        }

        // No update check for protocol contract instances
        bool check_update = event.exists && !event.is_protocol_contract;

        trace.set(
            row,
            { {
                { C::contract_instance_retrieval_sel, 1 },
                { C::contract_instance_retrieval_address, event.address },
                { C::contract_instance_retrieval_exists, event.exists ? 1 : 0 },

                // Contract instance members
                { C::contract_instance_retrieval_salt, event.contract_instance.salt },
                { C::contract_instance_retrieval_deployer_addr, event.contract_instance.deployer },
                { C::contract_instance_retrieval_current_class_id, event.contract_instance.current_contract_class_id },
                { C::contract_instance_retrieval_original_class_id,
                  event.contract_instance.original_contract_class_id },
                { C::contract_instance_retrieval_init_hash, event.contract_instance.initialization_hash },
                { C::contract_instance_retrieval_immutables_hash, event.contract_instance.immutables_hash },

                // Public keys (hinted). Only ivpk_m is held as a Grumpkin point;
                // the others are field-element hashes computed off-circuit by the PXE.
                { C::contract_instance_retrieval_nullifier_key_hash,
                  event.contract_instance.public_keys.nullifier_key_hash },
                { C::contract_instance_retrieval_incoming_viewing_key_x,
                  event.contract_instance.public_keys.incoming_viewing_key.x },
                { C::contract_instance_retrieval_incoming_viewing_key_y,
                  event.contract_instance.public_keys.incoming_viewing_key.y },
                { C::contract_instance_retrieval_outgoing_viewing_key_hash,
                  event.contract_instance.public_keys.outgoing_viewing_key_hash },
                { C::contract_instance_retrieval_tagging_key_hash,
                  event.contract_instance.public_keys.tagging_key_hash },

                // Tree context
                { C::contract_instance_retrieval_public_data_tree_root, event.public_data_tree_root },
                { C::contract_instance_retrieval_nullifier_tree_root, event.nullifier_tree_root },

                // Deployer protocol contract address constant
                { C::contract_instance_retrieval_deployer_protocol_contract_address,
                  CONTRACT_INSTANCE_REGISTRY_CONTRACT_ADDRESS },

                // Columns conditional on protocol contract instance
                { C::contract_instance_retrieval_address_sub_one, event.address - 1 },
                { C::contract_instance_retrieval_max_protocol_contracts, MAX_PROTOCOL_CONTRACTS },
                { C::contract_instance_retrieval_derived_address_pi_index, derived_address_pi_index },
                { C::contract_instance_retrieval_protocol_contract_derived_address_inv,
                  protocol_contract_derived_address }, // Will be inverted in batch later
                { C::contract_instance_retrieval_derived_address, derived_address },
                { C::contract_instance_retrieval_is_protocol_contract, event.is_protocol_contract ? 1 : 0 },
                { C::contract_instance_retrieval_should_check_nullifier, !event.is_protocol_contract ? 1 : 0 },
                { C::contract_instance_retrieval_nullifier_tree_height, NULLIFIER_TREE_HEIGHT },
                { C::contract_instance_retrieval_nullifier_merkle_separator, DOM_SEP__NULLIFIER_MERKLE },
                { C::contract_instance_retrieval_siloing_separator, DOM_SEP__SILOED_NULLIFIER },
                { C::contract_instance_retrieval_should_check_for_update, check_update ? 1 : 0 },
            } });
        row++;
    }

    // Batch invert the columns.
    trace.invert_columns({ { C::contract_instance_retrieval_protocol_contract_derived_address_inv } });
}

const InteractionDefinition ContractInstanceRetrievalTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupSequential, lookup_contract_instance_retrieval_deployment_nullifier_read_settings>()
        .add<InteractionType::LookupGeneric, lookup_contract_instance_retrieval_address_derivation_settings>()
        .add<InteractionType::LookupSequential, lookup_contract_instance_retrieval_update_check_settings>()
        .add<InteractionType::LookupGeneric, lookup_contract_instance_retrieval_check_protocol_address_range_settings>()
        .add<InteractionType::LookupIntoIndexedByRow,
             lookup_contract_instance_retrieval_read_derived_address_from_public_inputs_settings>();

} // namespace bb::avm2::tracegen
