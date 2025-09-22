#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/tx_context_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/context_provider.hpp"
#include "barretenberg/vm2/simulation/gadgets/written_public_data_slots_tree_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"

namespace bb::avm2::simulation {

struct TxContext {
    HighLevelMerkleDBInterface& merkle_db;
    WrittenPublicDataSlotsTreeCheckInterface& written_public_data_slots_tree;
    RetrievedBytecodesTreeCheckInterface& retrieved_bytecodes_tree;
    ContextProviderInterface& context_provider;
    Gas gas_used = { 0, 0 };
    SideEffectStates side_effect_states = { 0, 0 };

    TxContextEvent serialize_tx_context_event() const
    {
        return {
            .gas_used = gas_used,
            .tree_states = merkle_db.get_tree_state(),
            .written_public_data_slots_tree_snapshot = written_public_data_slots_tree.get_snapshot(),
            .retrieved_bytecodes_tree_snapshot = retrieved_bytecodes_tree.get_snapshot(),
            .side_effect_states = side_effect_states,
            .next_context_id = context_provider.get_next_context_id(),
        };
    }
};

} // namespace bb::avm2::simulation
