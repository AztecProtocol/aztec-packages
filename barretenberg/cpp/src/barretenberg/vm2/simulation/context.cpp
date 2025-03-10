#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/polynomials/univariate_coefficient_basis.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

/**************************************************************************************************
 *                                   BaseContext Class
 **************************************************************************************************/

ContextEvent BaseContext::serialize_context()
{

    auto [cd_offset, cd_size_offset] = this->get_calldata_info();
    auto [rd_offset, rd_size_offset] = this->get_returndata_info();
    return ContextEvent{
        .id = context_id,
        .parent_id = this->get_parent_id(),

        // State
        .pc = pc,
        .msg_sender = msg_sender,
        .contract_addr = address,
        .is_static = is_static,

        // Calldata info
        .cd_addr = cd_offset,
        .cd_size_addr = cd_size_offset,

        // Returndata info
        .rd_addr = rd_offset,
        .rd_size_addr = rd_size_offset,

        // Success
        .nested_ctx_success = nested_ctx_success,

        // Gas
        // .l2_gas_used;
        // .l2_gas_limit;
        // .da_gas_used;
        // .da_gas_limit;

        // Tree State
        // TreeSnapshots tree_state;
    };
};

ContextStackEvent BaseContext::snapshot_context()
{
    auto [cd_offset, cd_size_offset] = this->get_calldata_info();
    return ContextStackEvent{
        .id = context_id,
        .parent_id = this->get_parent_id(),

        // State
        .pc = next_pc, // NOTE: We need the next pc here so it should be set correctly
        .msg_sender = msg_sender,
        .contract_addr = address,
        .is_static = is_static,

        // Calldata info
        .cd_addr = cd_offset,
        .cd_size_addr = cd_size_offset,

        // Gas
        // .l2_gas_used;  -- this is also probably going to be "next gas used" or "gas_used_after"
        // .l2_gas_limit;
        // .da_gas_used;
        // .da_gas_limit;

        // Tree State
        // TreeSnapshots tree_state;
    };
}

// This pushes a new context event to the event emitter.
// And sets the last_context_event_ptr to the last event in the events vector.
// If this function is called repeatedly without a separate emit_current_context call, it will be a no-op
void BaseContext::reserve_context_event()
{
    emit_current_context();
    last_context_event = &events.last();
}

// Used to emit a new context event to the event emitter.
// If we have a last_context_event_ptr cached, no event is emitted, bu the last_context_event_ptr is cleared
void BaseContext::emit_current_context()
{
    if (last_context_event == nullptr) {
        auto event = serialize_context();
        events.emit(std::move(event));
    } else {
        last_context_event = nullptr;
    }
}

void BaseContext::emit_ctx_stack_event()
{
    auto event = snapshot_context();
    ctx_stack_events.emit(std::move(event));
}

/**************************************************************************************************
 *                                   EnqueuedCallContext Class
 **************************************************************************************************/
std::vector<FF> EnqueuedCallContext::get_calldata(uint32_t cd_offset, uint32_t size)
{
    return { calldata.begin() + cd_offset, calldata.begin() + cd_offset + size };
}

std::vector<FF> EnqueuedCallContext::get_returndata(uint32_t rd_offset, uint32_t size)
{
    return { top_level_returndata.begin() + rd_offset, top_level_returndata.begin() + rd_offset + size };
}

std::pair<uint32_t, uint32_t> EnqueuedCallContext::get_calldata_info()
{
    return { 0, 0 };
}

std::pair<uint32_t, uint32_t> EnqueuedCallContext::get_returndata_info()
{
    return { 0, 0 };
}

/**************************************************************************************************
 *                                   NestedContext Class
 **************************************************************************************************/
std::vector<FF> NestedContext::get_calldata(uint32_t cd_offset, uint32_t size)
{
    // This is the max size of the calldata that can be read.
    auto calldata_size = static_cast<uint32_t>(parent_context.get_memory().get(calldata_size_offset).value);
    // What happens if cd_offset > calldata_size
    // We only read what we need (or can)
    auto read_size = std::min(size, calldata_size - cd_offset);
    return parent_context.get_memory().get_slice(calldata_offset + cd_offset, read_size).first;
}

std::vector<FF> NestedContext::get_returndata(uint32_t rd_offset, uint32_t size)
{
    // TODO: Adjust to be the same as get_calldata
    return child_context->get_memory().get_slice(returndata_offset + rd_offset, returndata_size + size).first;
}

std::pair<uint32_t, uint32_t> NestedContext::get_calldata_info()
{
    return { calldata_offset, calldata_size_offset };
}

std::pair<uint32_t, uint32_t> NestedContext::get_returndata_info()
{
    return { returndata_offset, returndata_size };
}

/**************************************************************************************************
 *                                   ContextProvider Class
 **************************************************************************************************/
std::unique_ptr<ContextInterface> ContextProvider::make_enqueued_call_ctx(AztecAddress address,
                                                                          AztecAddress msg_sender,
                                                                          std::span<const FF> calldata,
                                                                          bool is_static)
{
    // FIXME: doing too much in a "constructor"!
    BytecodeId bytecode_id = tx_bytecode_manager.get_bytecode(address);

    uint32_t context_id = next_available_context_id++;

    return std::make_unique<EnqueuedCallContext>(context_id,
                                                 address,
                                                 msg_sender,
                                                 is_static,
                                                 std::make_unique<BytecodeManager>(bytecode_id, tx_bytecode_manager),
                                                 std::make_unique<Memory>(context_id, memory_events),
                                                 calldata,
                                                 context_events,
                                                 ctx_stack_events);
}

std::unique_ptr<ContextInterface> ContextProvider::make_nested_ctx(ContextInterface& parent,
                                                                   AztecAddress address,
                                                                   AztecAddress msg_sender,
                                                                   uint32_t calldata_offset,
                                                                   uint32_t calldata_size,
                                                                   bool is_static)
{
    // FIXME: doing too much in a "constructor"!
    BytecodeId bytecode_id = tx_bytecode_manager.get_bytecode(address);

    uint32_t context_id = next_available_context_id++;

    return std::make_unique<NestedContext>(context_id,
                                           address,
                                           msg_sender,
                                           is_static,
                                           std::make_unique<BytecodeManager>(bytecode_id, tx_bytecode_manager),
                                           std::make_unique<Memory>(context_id, memory_events),
                                           calldata_offset,
                                           calldata_size,
                                           parent,
                                           context_events,
                                           ctx_stack_events);
}
} // namespace bb::avm2::simulation
