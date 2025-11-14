#pragma once

#include <cstdint>
#include <variant>

#include "barretenberg/vm2/common/avm_io.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/tx_context_event.hpp"

namespace bb::avm2::simulation {

struct PhaseLengths {
    uint32_t nr_nullifier_insertion = 0;
    uint32_t nr_note_insertion = 0;
    uint32_t nr_l2_to_l1_message = 0;
    uint32_t setup = 0;
    uint32_t r_nullifier_insertion = 0;
    uint32_t r_note_insertion = 0;
    uint32_t r_l2_to_l1_message = 0;
    uint32_t app_logic = 0;
    uint32_t teardown = 0;

    static PhaseLengths from_tx(const Tx& tx)
    {
        return PhaseLengths{
            .nr_nullifier_insertion = static_cast<uint32_t>(tx.non_revertible_accumulated_data.nullifiers.size()),
            .nr_note_insertion = static_cast<uint32_t>(tx.non_revertible_accumulated_data.note_hashes.size()),
            .nr_l2_to_l1_message = static_cast<uint32_t>(tx.non_revertible_accumulated_data.l2_to_l1_messages.size()),
            .setup = static_cast<uint32_t>(tx.setup_enqueued_calls.size()),
            .r_nullifier_insertion = static_cast<uint32_t>(tx.revertible_accumulated_data.nullifiers.size()),
            .r_note_insertion = static_cast<uint32_t>(tx.revertible_accumulated_data.note_hashes.size()),
            .r_l2_to_l1_message = static_cast<uint32_t>(tx.revertible_accumulated_data.l2_to_l1_messages.size()),
            .app_logic = static_cast<uint32_t>(tx.app_logic_enqueued_calls.size()),
            .teardown = tx.teardown_enqueued_call.has_value() ? 1U : 0U,
        };
    }
};

struct TxStartupEvent {
    TxContextEvent state;
    Gas gas_limit;
    Gas teardown_gas_limit;
    PhaseLengths phase_lengths;
};

struct EnqueuedCallEvent {
    FF msg_sender = 0; // TODO(dbanks12): order sender and address to match other functions/types
    FF contract_address = 0;
    FF transaction_fee = 0;
    bool is_static = false;
    uint32_t calldata_size = 0;
    FF calldata_hash = 0;
    Gas start_gas;
    Gas end_gas;
    bool success = false;
};

struct PrivateAppendTreeEvent {
    FF leaf_value = 0;
    uint64_t size = 0;
};

struct PrivateEmitL2L1MessageEvent {
    ScopedL2ToL1Message scoped_msg;
};

struct CollectGasFeeEvent {
    uint128_t effective_fee_per_da_gas = 0;
    uint128_t effective_fee_per_l2_gas = 0;
    AztecAddress fee_payer = 0;
    FF fee_payer_balance = 0;
    FF fee_juice_balance_slot = 0;
    FF fee = 0;
};

struct PadTreesEvent {};

struct CleanupEvent {};

struct EmptyPhaseEvent {};

using TxPhaseEventType = std::variant<EnqueuedCallEvent,
                                      PrivateAppendTreeEvent,
                                      PrivateEmitL2L1MessageEvent,
                                      CollectGasFeeEvent,
                                      PadTreesEvent,
                                      CleanupEvent,
                                      EmptyPhaseEvent>;

struct TxPhaseEvent {
    TransactionPhase phase;
    TxContextEvent state_before;
    TxContextEvent state_after;
    bool reverted = false;
    TxPhaseEventType event;
};

using TxEvent = std::variant<TxStartupEvent, TxPhaseEvent>;

} // namespace bb::avm2::simulation
