#include "barretenberg/vm2/tracegen/contract_instance_retrieval_trace.hpp"

#include <memory>

#include "barretenberg/vm2/common/aztec_constants.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/generated/relations/lookups_contract_instance_retrieval.hpp"
#include "barretenberg/vm2/simulation/events/contract_instance_retrieval_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
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
        trace.set(
            row,
            { {
                { C::contract_instance_retrieval_sel, 1 },
                { C::contract_instance_retrieval_address, event.address },
                { C::contract_instance_retrieval_exists, event.nullifier_exists ? 1 : 0 },

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
                  event.deployer_protocol_contract_address },
            } });
        row++;
    }
}

const InteractionDefinition ContractInstanceRetrievalTraceBuilder::interactions =
    InteractionDefinition()
        .add<lookup_contract_instance_retrieval_deployment_nullifier_read_settings, InteractionType::LookupSequential>()
        .add<lookup_contract_instance_retrieval_address_derivation_settings, InteractionType::LookupSequential>()
        .add<lookup_contract_instance_retrieval_update_check_settings, InteractionType::LookupSequential>();

} // namespace bb::avm2::tracegen
