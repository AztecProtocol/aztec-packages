#include "barretenberg/vm2/simulation/addressing.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

std::vector<Operand> Addressing::resolve(const Instruction& instruction, MemoryInterface& memory) const
{
    // We'll be filling in the event as we progress.
    AddressingEvent event;
    event.instruction = instruction;

    try {
        // Note: it's fine to query instruction info in here since it does not trigger events.
        ExecutionOpCode opcode = instruction_info_db.map_wire_opcode_to_execution_opcode(instruction.opcode);
        const InstructionSpec& spec = instruction_info_db.get(opcode);
        event.spec = &spec;
        // This represents either: (1) wrong info in the spec, or (2) a wrong witgen deserialization.
        // Therefore, it is not an error the circuit should be able to prove.
        assert(spec.num_addresses <= instruction.operands.size());

        // We retrieve, cache first because this is probably what we'll do in the circuit.
        // However, we can't check the value and tag yet! This should be done only if it's used.
        // This is because the first few instructions might not YET have a valid stack pointer.
        auto base_address = memory.get(0);
        event.base_address_tag = base_address.tag;
        event.base_address_val = base_address.value;

        // First process relative addressing for all the addresses.
        event.after_relative = instruction.operands;
        for (size_t i = 0; i < spec.num_addresses; ++i) {
            if ((instruction.indirect >> i) & 1) {
                if (!memory.is_valid_address(base_address)) {
                    throw AddressingException(AddressingEventError::BASE_ADDRESS_INVALID_ADDRESS, i);
                }

                MemoryValue offset(event.after_relative[i]);
                offset += base_address.value;
                event.after_relative[i] = Operand::ff(offset);
                if (!memory.is_valid_address(offset)) {
                    throw AddressingException(AddressingEventError::RELATIVE_COMPUTATION_OOB, i);
                }
            }
        }

        // Then indirection.
        event.resolved_operands = event.after_relative;
        for (size_t i = 0; i < spec.num_addresses; ++i) {
            if ((instruction.indirect >> (i + spec.num_addresses)) & 1) {
                MemoryValue offset(event.resolved_operands[i]);
                if (!memory.is_valid_address(offset)) {
                    throw AddressingException(AddressingEventError::INDIRECT_INVALID_ADDRESS, i);
                }
                auto new_address = memory.get(static_cast<MemoryAddress>(offset));
                event.resolved_operands[i] = Operand::ff(new_address.value);
            }
        }

        // We guarantee that the resolved operands are valid addresses.
        for (size_t i = 0; i < spec.num_addresses; ++i) {
            if (!memory.is_valid_address(MemoryValue(event.resolved_operands[i]))) {
                throw AddressingException(AddressingEventError::FINAL_ADDRESS_INVALID, i);
            }
            event.resolved_operands[i] =
                static_cast<Operand>(static_cast<MemoryAddress>(event.resolved_operands[i].operator FF()));
        }
    } catch (const AddressingException& e) {
        event.error = e;
    }

    events.emit(AddressingEvent(event));
    if (event.error.has_value()) {
        // Signal the error to the caller.
        throw AddressingException(event.error.value());
    }

    return event.resolved_operands;
}

} // namespace bb::avm2::simulation