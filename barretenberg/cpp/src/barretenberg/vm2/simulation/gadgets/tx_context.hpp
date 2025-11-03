#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/tx_context_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/lib/side_effect_tracker.hpp"

namespace bb::avm2::simulation {

struct TxContext {
    HighLevelMerkleDBInterface& merkle_db;
    WrittenPublicDataSlotsTreeCheckInterface& written_public_data_slots_tree;
    RetrievedBytecodesTreeCheckInterface& retrieved_bytecodes_tree;
    ContextProviderInterface& context_provider;
    SideEffectTrackerInterface& side_effect_tracker;

    Gas gas_used = { 0, 0 };
    bool reverted = false;                           // if any revertible phase reverted
    std::optional<std::vector<FF>> app_logic_output; // last app logic returndata

    TxContextEvent serialize_tx_context_event() const
    {
        auto& side_effects = side_effect_tracker.get_side_effects();

        return {
            .gas_used = gas_used,
            .tree_states = merkle_db.get_tree_state(),
            .written_public_data_slots_tree_snapshot = written_public_data_slots_tree.get_snapshot(),
            .retrieved_bytecodes_tree_snapshot = retrieved_bytecodes_tree.get_snapshot(),
            .numUnencryptedLogFields = side_effects.get_num_unencrypted_log_fields(),
            .numL2ToL1Messages = static_cast<uint32_t>(side_effects.l2_to_l1_messages.size()),
            .next_context_id = context_provider.get_next_context_id(),
        };
    }
};

} // namespace bb::avm2::simulation
