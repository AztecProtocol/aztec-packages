#pragma once

#include <cstdint>
#include <variant>

#include "barretenberg/vm2/common/avm_inputs.hpp"
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
            .nr_nullifier_insertion = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.nullifiers.size()),
            .nr_note_insertion = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.noteHashes.size()),
            .nr_l2_to_l1_message = static_cast<uint32_t>(tx.nonRevertibleAccumulatedData.l2ToL1Messages.size()),
            .setup = static_cast<uint32_t>(tx.setupEnqueuedCalls.size()),
            .r_nullifier_insertion = static_cast<uint32_t>(tx.revertibleAccumulatedData.nullifiers.size()),
            .r_note_insertion = static_cast<uint32_t>(tx.revertibleAccumulatedData.noteHashes.size()),
            .r_l2_to_l1_message = static_cast<uint32_t>(tx.revertibleAccumulatedData.l2ToL1Messages.size()),
            .app_logic = static_cast<uint32_t>(tx.appLogicEnqueuedCalls.size()),
            .teardown = tx.teardownEnqueuedCall ? 1U : 0U,
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
    FF msg_sender; // TODO(dbanks12): order sender and address to match other functions/types
    FF contract_address;
    FF transaction_fee;
    bool is_static;
    uint32_t calldata_size;
    FF calldata_hash;
    Gas start_gas;
    Gas end_gas;
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
    bool reverted;
    TxPhaseEventType event;
};

using TxEvent = std::variant<TxStartupEvent, TxPhaseEvent>;

} // namespace bb::avm2::simulation
