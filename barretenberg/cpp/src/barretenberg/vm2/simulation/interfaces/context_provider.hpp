#pragma once

#include <memory>
#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

class ContextProviderInterface {
  public:
    virtual ~ContextProviderInterface() = default;

    virtual std::unique_ptr<ContextInterface> make_nested_context(AztecAddress address,
                                                                  AztecAddress msg_sender,
                                                                  FF transaction_fee,
                                                                  ContextInterface& parent_context,
                                                                  MemoryAddress cd_offset_address,
                                                                  uint32_t cd_size,
                                                                  bool is_static,
                                                                  Gas gas_limit,
                                                                  SideEffectStates side_effect_states,
                                                                  TransactionPhase phase) = 0;

    virtual std::unique_ptr<ContextInterface> make_enqueued_context(AztecAddress address,
                                                                    AztecAddress msg_sender,
                                                                    FF transaction_fee,
                                                                    std::span<const FF> calldata,
                                                                    bool is_static,
                                                                    Gas gas_limit,
                                                                    Gas gas_used,
                                                                    SideEffectStates side_effect_states,
                                                                    TransactionPhase phase) = 0;

    // This can be removed if we use clk for the context id
    virtual uint32_t get_next_context_id() const = 0;
};

} // namespace bb::avm2::simulation
