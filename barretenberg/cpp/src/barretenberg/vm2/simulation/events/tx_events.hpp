#pragma once

#include <cstdint>
#include <variant>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

struct EnqueuedCallEvent {
    FF msg_sender;
    FF contract_address;
    bool is_static;
    FF calldata_hash;
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

using TxEventType =
    std::variant<EnqueuedCallEvent, PrivateAppendTreeEvent, PrivateEmitL2L1MessageEvent, CollectGasFeeEvent>;

struct TxEvent {
    TransactionPhase phase;
    TreeStates prev_tree_state;
    TreeStates next_tree_state;
    Gas prev_gas_used;
    Gas gas_used;
    Gas gas_limit;

    bool reverted;

    TxEventType event;
};

} // namespace bb::avm2::simulation
