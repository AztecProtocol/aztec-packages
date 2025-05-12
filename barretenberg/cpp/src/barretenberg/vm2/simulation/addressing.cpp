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
        ExecutionOpCode exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
        const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);
        event.spec = &spec;
        // This represents either: (1) wrong info in the spec, or (2) a wrong witgen deserialization.
        // Therefore, it is not an error the circuit should be able to prove.
        assert(spec.num_addresses <= instruction.operands.size());

        // We retrieve, cache first because this is probably what we'll do in the circuit.
        // However, we can't check that the base address is valid* yet! This should be done only if it's used.
        // This is because the first few instructions might not YET have a valid stack pointer.
        // *valid = valid_address and valid_tag.
        MemoryValue base_address = memory.get(0);
        event.base_address = base_address;

        // First, we make sure that the operands themselves are valid addresses.
        for (size_t i = 0; i < spec.num_addresses; ++i) {
            // We are a bit flexible here, we don't check the tag, because we might get a U8 or U16 from the
            // wire format but would want to interpret it as a MemoryAddress. We only need to check that "it fits".
            // That's why we use as_ff() here.
            if (!memory.is_valid_address(instruction.operands[i].as_ff())) {
                throw AddressingException(AddressingEventError::OPERAND_INVALID_ADDRESS, i);
            }
        }

        // Guarantees by this point:
        // - all operands are valid addresses IF interpreted as a MemoryAddress.

        // Then, we process relative addressing for all the addresses.
        // That is, if relative addressing is used, after_relative[i] = base_address + operands[i].
        // We fist store the operands as is, and then we'll update them if they are relative.
        event.after_relative = instruction.operands;
        for (size_t i = 0; i < spec.num_addresses; ++i) {
            if ((instruction.indirect >> (i * 2 + 1)) & 1) {
                if (!memory.is_valid_address(base_address)) {
                    throw AddressingException(AddressingEventError::BASE_ADDRESS_INVALID_ADDRESS, i);
                }

                // We extend the address to FF to avoid overflows.
                FF offset = event.after_relative[i];
                offset += base_address;
                // We store the offset as an FF operand. If the circuit needs to prove overflow, it will
                // need the full value.
                event.after_relative[i] = Operand::from<FF>(offset);
                if (!memory.is_valid_address(offset)) {
                    // If this happens, it means that the relative computation overflowed. However both the base and
                    // operand addresses by themselves were valid.
                    throw AddressingException(AddressingEventError::RELATIVE_COMPUTATION_OOB, i);
                }
            }
            // Now that we are sure that the offset is valid, we can update the value to be of the right type.
            event.after_relative[i] = Operand::from(static_cast<MemoryAddress>(event.after_relative[i].as_ff()));
        }

        // Guarantees by this point:
        // - all operands are valid addresses IF interpreted as MemoryAddress.
        // - all after_relative values are valid addresses.

        // Then indirection.
        // That is, if indirection is used, resolved_operands[i] = memory[after_relative[i]].
        // We first store the after_relative values as is, and then we'll update them if they are indirect.
        event.resolved_operands = event.after_relative;
        for (size_t i = 0; i < spec.num_addresses; ++i) {
            if ((instruction.indirect >> (i * 2)) & 1) {
                event.resolved_operands[i] = memory.get(event.after_relative[i].as<MemoryAddress>());
                if (!memory.is_valid_address(event.resolved_operands[i])) {
                    throw AddressingException(AddressingEventError::INDIRECT_INVALID_ADDRESS, i);
                }
            }
        }

        // Guarantees by this point:
        // - all operands are valid addresses.
        // - all after_relative values are valid addresses.
        // - all resolved_operands are valid addresses.
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
