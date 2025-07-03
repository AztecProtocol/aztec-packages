#pragma once

#include <cstdint>
#include <exception>
#include <vector>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/bytecode_events.hpp"
#include "barretenberg/vm2/simulation/events/context_events.hpp"
#include "barretenberg/vm2/simulation/events/gas_event.hpp"
#include "barretenberg/vm2/simulation/events/internal_call_stack_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

// Possible mutually exclusive execution errors.
enum class ExecutionError {
    NONE,
    BYTECODE_NOT_FOUND,
    INSTRUCTION_FETCHING,
    ADDRESSING,
    REGISTER_READ,
    GAS,
    OPCODE_EXECUTION
};

class TagCheckError : public std::exception {
  public:
    explicit TagCheckError(MemoryTag expected_tag, MemoryTag actual_tag)
        : expected_tag(std::make_unique<MemoryTag>(expected_tag))
        , actual_tag(std::make_unique<MemoryTag>(actual_tag))
    {}

    const char* what() const noexcept override { return "Tag check failed"; }

  private:
    std::unique_ptr<MemoryTag> expected_tag;
    std::unique_ptr<MemoryTag> actual_tag;
};

struct ExecutionEvent {
    ExecutionError error = ExecutionError::NONE;
    BytecodeId bytecode_id;
    Instruction wire_instruction;

    // Inputs and Outputs for a gadget/subtrace used when allocating registers in the execution trace.
    std::vector<TaggedValue> inputs;
    TaggedValue output;

    // Context Id for the next context.
    uint32_t next_context_id;

    // Sub-events.
    AddressingEvent addressing_event;
    ContextEvent before_context_event; // FIXME: currently unused (also might be overkill).
    ContextEvent after_context_event;

    GasEvent gas_event;

    // function to determine whether the event was a context "failure"
    bool is_failure() const
    {
        // WARNING: it is important that we check for error first here because
        // if instruction fetching fails, we cannot do `wire_instruction.get_exec_opcode()`
        return error != ExecutionError::NONE || wire_instruction.get_exec_opcode() == ExecutionOpCode::REVERT;
    }

    // function to determine whether the event represents a context "exit"
    bool is_exit() const { return is_failure() || wire_instruction.get_exec_opcode() == ExecutionOpCode::RETURN; }
};

} // namespace bb::avm2::simulation
