#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_contract_instance_retrieval.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_retrieval_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/contract_crypto.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

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
        FF protocol_contract_derived_address_inv = 0;
        uint32_t derived_address_pi_index = 0;

        if (event.is_protocol_contract) {
            derived_address = event.exists ? simulation::compute_contract_address(event.contract_instance) : 0;
            protocol_contract_derived_address_inv = event.exists ? derived_address.invert() : 0;
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
                { C::contract_instance_retrieval_deployer_addr, event.contract_instance.deployer_addr },
                { C::contract_instance_retrieval_current_class_id, event.contract_instance.current_class_id },
                { C::contract_instance_retrieval_original_class_id, event.contract_instance.original_class_id },
                { C::contract_instance_retrieval_init_hash, event.contract_instance.initialisation_hash },

                // Public keys (hinted)
                { C::contract_instance_retrieval_nullifier_key_x, event.contract_instance.public_keys.nullifier_key.x },
                { C::contract_instance_retrieval_nullifier_key_y, event.contract_instance.public_keys.nullifier_key.y },
                { C::contract_instance_retrieval_incoming_viewing_key_x,
                  event.contract_instance.public_keys.incoming_viewing_key.x },
                { C::contract_instance_retrieval_incoming_viewing_key_y,
                  event.contract_instance.public_keys.incoming_viewing_key.y },
                { C::contract_instance_retrieval_outgoing_viewing_key_x,
                  event.contract_instance.public_keys.outgoing_viewing_key.x },
                { C::contract_instance_retrieval_outgoing_viewing_key_y,
                  event.contract_instance.public_keys.outgoing_viewing_key.y },
                { C::contract_instance_retrieval_tagging_key_x, event.contract_instance.public_keys.tagging_key.x },
                { C::contract_instance_retrieval_tagging_key_y, event.contract_instance.public_keys.tagging_key.y },

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
                  protocol_contract_derived_address_inv },
                { C::contract_instance_retrieval_derived_address, derived_address },
                { C::contract_instance_retrieval_is_protocol_contract, event.is_protocol_contract ? 1 : 0 },
                { C::contract_instance_retrieval_should_check_nullifier, !event.is_protocol_contract ? 1 : 0 },
                { C::contract_instance_retrieval_should_check_for_update, check_update ? 1 : 0 },
            } });
        row++;
    }
}

const InteractionDefinition ContractInstanceRetrievalTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_contract_instance_retrieval_deployment_nullifier_read_settings, InteractionType::LookupSequential>()
        .add<lookup_contract_instance_retrieval_address_derivation_settings, InteractionType::LookupGeneric>()
        .add<lookup_contract_instance_retrieval_update_check_settings, InteractionType::LookupSequential>()
        .add<lookup_contract_instance_retrieval_check_protocol_address_range_settings, InteractionType::LookupGeneric>()
        .add<lookup_contract_instance_retrieval_read_derived_address_from_public_inputs_settings,
             InteractionType::LookupIntoIndexedByClk>();

} // namespace bb::avm2::tracegen
