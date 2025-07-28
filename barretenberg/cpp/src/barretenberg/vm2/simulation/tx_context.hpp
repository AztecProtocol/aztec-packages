#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/tx_context_event.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/vm2/simulation/written_public_data_slots_tree_check.hpp"

namespace bb::avm2::simulation {

struct TxContext {
    HighLevelMerkleDBInterface& merkle_db;
    WrittenPublicDataSlotsTreeCheckInterface& written_public_data_slots_tree;
    Gas gas_used = { 0, 0 };

    TxContextEvent serialize_tx_context_event() const
    {
        return {
            .gas_used = gas_used,
            .tree_states = merkle_db.get_tree_state(),
            .written_public_data_slots_tree_snapshot = written_public_data_slots_tree.snapshot(),
        };
    }
};

} // namespace bb::avm2::simulation
