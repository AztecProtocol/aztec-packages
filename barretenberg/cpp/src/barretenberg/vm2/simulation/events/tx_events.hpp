#pragma once

#include <cstdint>
#include <variant>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/tx_context_event.hpp"

namespace bb::avm2::simulation {

struct TxStartupEvent {
    TxContextEvent state;
};

struct EnqueuedCallEvent {
    FF msg_sender; // TODO(dbanks12): order sender and address to match other functions/types
    FF contract_address;
    FF transaction_fee;
    bool is_static;
    FF calldata_hash;
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
    FF fee_juice_balance_slot;
    FF fee;
};

using TxPhaseEventType =
    std::variant<EnqueuedCallEvent, PrivateAppendTreeEvent, PrivateEmitL2L1MessageEvent, CollectGasFeeEvent>;

struct TxPhaseEvent {
    TransactionPhase phase;
    TxContextEvent state_before;
    TxContextEvent state_after;
    bool reverted;
    TxPhaseEventType event;
};

using TxEvent = std::variant<TxStartupEvent, TxPhaseEvent>;

} // namespace bb::avm2::simulation
