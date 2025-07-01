#pragma once

#include <cstdint>
#include <variant>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct TxStartupEvent {
    Gas tx_gas_limit;
    Gas private_gas_used;
    TreeStates tree_state;
};

struct EnqueuedCallEvent {
    FF msg_sender; // TODO(dbanks12): order sender and address to match other functions/types
    FF contract_address;
    FF transaction_fee;
    bool is_static;
    FF calldata_hash;
    Gas prev_gas_used;
    Gas gas_used;
    Gas gas_limit;
    bool success;
};

struct PrivateAppendTreeEvent {
    FF leaf_value;
    uint64_t size;
};

struct PrivateEmitL2L1MessageEvent {
    ScopedL2ToL1Message scoped_msg;
};

struct CollectGasFeeEvent {
    uint128_t effective_fee_per_da_gas;
    uint128_t effective_fee_per_l2_gas;
    AztecAddress fee_payer;
    FF fee_payer_balance;
    FF fee;
};

using TxPhaseEventType =
    std::variant<EnqueuedCallEvent, PrivateAppendTreeEvent, PrivateEmitL2L1MessageEvent, CollectGasFeeEvent>;

struct TxPhaseEvent {
    TransactionPhase phase;
    TreeStates prev_tree_state;
    TreeStates next_tree_state;

    bool reverted;

    TxPhaseEventType event;
};

using TxEvent = std::variant<TxStartupEvent, TxPhaseEvent>;

} // namespace bb::avm2::simulation
