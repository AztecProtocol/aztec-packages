#pragma once

#include <cstdint>
#include <variant>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct PhaseEvent {
    TransactionPhase phase;
    FF msg_sender;
    FF contract_address;
    bool is_static;
    FF calldata_hash;
    bool success;

    TreeStates tree_state;
};

struct PrivateAppendTreeEvent {
    TransactionPhase phase;
    TreeStates tree_state;

    FF leaf_value;
    uint64_t size;
};

struct PrivateEmitL2L1MessageEvent {
    TransactionPhase phase;
    ScopedL2ToL1Message scoped_msg;
    // TODO: Add Counter
};

struct CollectGasFeeEvent {
    TransactionPhase phase;
    FF fee_per_da_gas;
    FF fee_per_l2_gas;

    FF max_fee_per_da_gas;
    FF max_fee_per_l2_gas;

    FF max_priority_fees_per_l2_gas;
    FF max_priority_fees_per_da_gas;

    TreeStates tree_state;
};

using TxEventType = std::variant<PhaseEvent, PrivateAppendTreeEvent, PrivateEmitL2L1MessageEvent, CollectGasFeeEvent>;

struct TxEvent {
    TransactionPhase phase;
    TreeStates prev_tree_state;
    TreeStates next_tree_state;
    TxEventType event;
};

} // namespace bb::avm2::simulation
