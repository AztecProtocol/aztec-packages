#include "barretenberg/vm2/simulation/addressing.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/addressing.hpp"
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
    // We initialize all the phases with the original operands.
    // This is expected for non-address operands.
    // For address operands, we'll update them as we go.
    for (const auto& operand : instruction.operands) {
        event.resolution_info.emplace_back(OperandResolutionInfo{
            .after_relative = operand,
            .resolved_operand = operand,
            .error = std::nullopt,
        });
    }

    // Note: it's fine to query instruction info in here since it does not trigger events.
    ExecutionOpCode exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
    const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);

    // This represents either: (1) wrong info in the spec, or (2) a wrong witgen deserialization.
    // Therefore, it is not an error the circuit should be able to prove.
    assert(spec.num_addresses <= instruction.operands.size());

    // We retrieve and cache the base address first.
    // This simplifies the circuit but the downside is that we always do the memory access (and lookup).
    // However, most memory accesses are expected to use the relative mode so this should be ok.
    //
    // Note that we can't check that the base address is valid* yet! This should be done only if it's used.
    // This is because the first few instructions might not YET have a valid stack pointer.
    // *valid = valid_address and valid_tag.
    // TODO(fcarreiro): we only really need to check that this is valid if we want to optimize the range check in the
    // relative sum.
    //
    // This memory access is guaranteed to succeed.
    MemoryValue base_address = memory.get(0);
    event.base_address = base_address;

    // We process each address separately.
    // Even if one fails, we continue processing the other ones.
    // This is to simplify error handling in the circuit.
    for (size_t i = 0; i < spec.num_addresses; ++i) {
        auto& resolution_info = event.resolution_info[i];
        try {
            // TODO: Should this be an assert? We may not want to assert this in the circuit.
            // First, we make sure that the operands themselves are valid addresses.
            // We are a bit flexible here, we don't check the tag, because we might get a U8 or U16 from the
            // wire format but would want to interpret it as a MemoryAddress. We only need to check that "it fits".
            // That's why we use as_ff() here.
            if (!memory.is_valid_address(instruction.operands[i].as_ff())) {
                throw AddressingEventError::OPERAND_INVALID_ADDRESS;
            }

            // Guarantees by this point:
            // - all operands are valid addresses IF interpreted as a MemoryAddress.

            // Then, we process relative addressing for all the addresses.
            // That is, if relative addressing is used, after_relative[i] = base_address + operands[i].
            // We fist store the operands as is, and then we'll update them if they are relative.
            resolution_info.after_relative = instruction.operands[i];
            if (is_operand_relative(instruction.indirect, i)) {
                // This will only
                if (!memory.is_valid_address(base_address)) {
                    throw AddressingEventError::BASE_ADDRESS_INVALID_ADDRESS;
                }

                // We extend the address to FF to avoid overflows.
                FF offset = resolution_info.after_relative;
                offset += base_address;
                // We store the offset as an FF operand. If the circuit needs to prove overflow, it will
                // need the full value.
                resolution_info.after_relative = Operand::from<FF>(offset);
                if (!memory.is_valid_address(offset)) {
                    // If this happens, it means that the relative computation overflowed. However both the base and
                    // operand addresses by themselves were valid.
                    throw AddressingEventError::RELATIVE_COMPUTATION_OOB;
                }
            }
            // Now that we are sure that the offset is valid, we can update the value to be of the right type.
            resolution_info.after_relative =
                Operand::from(static_cast<MemoryAddress>(resolution_info.after_relative.as_ff()));

            // Guarantees by this point:
            // - all operands are valid addresses IF interpreted as MemoryAddress.
            // - all after_relative values are valid addresses.

            // Then indirection.
            // That is, if indirection is used, resolved_operands[i] = memory[after_relative[i]].
            // We first store the after_relative values as is, and then we'll update them if they are indirect.
            resolution_info.resolved_operand = resolution_info.after_relative;
            if (is_operand_indirect(instruction.indirect, i)) {
                resolution_info.resolved_operand = memory.get(resolution_info.after_relative.as<MemoryAddress>());
                if (!memory.is_valid_address(resolution_info.resolved_operand)) {
                    throw AddressingEventError::INDIRECT_INVALID_ADDRESS;
                }
            }

            // Guarantees by this point:
            // - all operands are valid addresses.
            // - all after_relative values are valid addresses.
            // - all resolved_operands are valid addresses.
        } catch (const AddressingEventError& e) {
            resolution_info.error = e;
        }
    }

    events.emit(AddressingEvent(event));
    if (std::any_of(event.resolution_info.begin(), event.resolution_info.end(), [](const auto& info) {
            return info.error.has_value();
        })) {
        // Signal the error to the caller.
        // On purpose we don't give any more information than "Error resolving operands."
        throw AddressingException();
    }

    // Collect resolved operands and return them.
    std::vector<Operand> resolved_operands;
    resolved_operands.reserve(event.resolution_info.size());
    for (const auto& info : event.resolution_info) {
        resolved_operands.push_back(info.resolved_operand);
    }
    return resolved_operands;
}

} // namespace bb::avm2::simulation
