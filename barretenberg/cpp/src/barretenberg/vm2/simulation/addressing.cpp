#include "barretenberg/vm2/simulation/addressing.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/common/log.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/memory_event.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

std::vector<Operand> Addressing::resolve(const Instruction& instruction, MemoryInterface& memory)
{
    // We'll be filling in the event as we progress.
    AddressingEvent event;
    event.instruction = instruction;
    // We initialize all the phases with the original operands.
    // This is expected for non-address (i.e., immediate) operands.
    // For address operands, we'll update them as we go.
    for (const auto& operand : instruction.operands) {
        event.resolution_info.push_back({
            .after_relative = operand,
            .resolved_operand = operand,
        });
    }

    // Note: it's fine to query instruction info in here since it does not trigger events.
    // Also, if addressing is being resolved, we can assume that instruction fetching succeeded.
    ExecutionOpCode exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
    const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);

    // This represents either: (1) wrong info in the spec, or (2) a wrong witgen deserialization.
    // Therefore, it is not an error the circuit should be able to prove.
    assert(spec.num_addresses <= instruction.operands.size());

    // We will read the base address only if we have any relative operands.
    std::optional<MemoryValue> base_address;

    // We process each address separately.
    // Even if one fails, we continue processing the other ones.
    // This is to simplify error handling in the circuit.
    for (size_t i = 0; i < spec.num_addresses; ++i) {
        auto& resolution_info = event.resolution_info[i];
        try {
            // Simulation and the circuit assume that the operands are valid addresses.
            // This should be guaranteed by instruction fetching and the wire format.
            assert(FF(static_cast<uint32_t>(instruction.operands[i].as_ff())) == instruction.operands[i].as_ff());

            // Guarantees by this point:
            // - original operand is a valid address IF interpreted as a MemoryAddress.

            // Then, we process relative addressing for all the addresses.
            // That is, if relative addressing is used, after_relative[i] = base_address + operands[i].
            // We first store the operands as is, and then we'll update them if they are relative.
            resolution_info.after_relative = instruction.operands[i]; // default value if not relative.
            if (is_operand_relative(instruction.indirect, i)) {
                // Load the base address if we haven't already.
                if (!base_address) {
                    base_address = memory.get(0);
                    event.base_address = *base_address;
                }
                // This does not produce events. We are expected to check the tag to be UINT32.
                if (!memory.is_valid_address(*base_address)) {
                    throw AddressingEventError::BASE_ADDRESS_INVALID;
                }

                // We extend the address to FF to avoid overflows.
                FF offset = resolution_info.after_relative;
                offset += *base_address;
                // We store the offset as an FF operand. If the circuit needs to prove overflow, it will
                // need the full value.
                resolution_info.after_relative = Operand::from<FF>(offset);
                if (!is_valid_address(offset)) {
                    // If this happens, it means that the relative computation overflowed. However both the base and
                    // operand addresses by themselves were valid.
                    throw AddressingEventError::RELATIVE_COMPUTATION_OOB;
                }
            }
            // Now that we are sure that the offset is valid, we can update the value to be of the right type.
            resolution_info.after_relative =
                Operand::from(static_cast<MemoryAddress>(resolution_info.after_relative.as_ff()));

            // Guarantees by this point:
            // - original operand is a valid address IF interpreted as MemoryAddress.
            // - after_relative is a valid address.

            // Then indirection.
            // That is, if indirection is used, resolved_operands[i] = memory[after_relative[i]].
            // We first store the after_relative values as is, and then we'll update them if they are indirect.
            resolution_info.resolved_operand = resolution_info.after_relative;
            if (is_operand_indirect(instruction.indirect, i)) {
                resolution_info.resolved_operand = memory.get(resolution_info.after_relative.as<MemoryAddress>());
                if (!memory.is_valid_address(resolution_info.resolved_operand)) {
                    throw AddressingEventError::INVALID_ADDRESS_AFTER_INDIRECTION;
                }
            }

            // Guarantees by this point:
            // - original operand is a valid address IF interpreted as MemoryAddress.
            // - after_relative is a valid address.
            // - resolved_operand is a valid address.
        } catch (const AddressingEventError& e) {
            resolution_info.error = e;
        }
    }

    events.emit(AddressingEvent(event));
    // If any entry in resolution_info has an error set, throw.
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

bool Addressing::is_valid_address(const FF& address)
{
    // Precondition: address should fit in 33 bits.
    uint128_t address_u128 = uint128_t(address);
    assert(address_u128 <= 0x1FFFFFFFF);
    // This leaks circuit information.
    // See https://hackmd.io/moq6viBpRJeLpWrHAogCZw?view#Comparison-between-range-constrained-numbers.
    bool address_lt_32_bits = (static_cast<uint32_t>(address_u128) == address_u128);
    uint128_t two_to_32 = uint128_t(1) << 32;
    uint128_t result = address_lt_32_bits ? two_to_32 - address_u128 - 1 : address_u128 - two_to_32;
    range_check.assert_range(result, 32);
    return address_lt_32_bits;
}

} // namespace bb::avm2::simulation
