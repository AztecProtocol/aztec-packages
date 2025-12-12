#include "barretenberg/vm2/simulation/gadgets/addressing.hpp"

#include <algorithm>
#include <cstddef>
#include <optional>
#include <vector>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/instruction_spec.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/common/opcodes.hpp"

namespace bb::avm2::simulation {

/**
 * @brief Resolve the operands of an instruction. If the operands are non-addresses, they are returned as is.
 * If the operands are addresses, we apply relative addressing and indirection to them. We emit an event of type
 * AddressingEvent with the resolution information.
 *
 * @param instruction the instruction to resolve
 * @param memory the memory to use
 * @return std::vector<Operand> the resolved operands
 * @throws AddressingException if an error occurs:
 * - BASE_ADDRESS_INVALID: the base address is invalid
 * - RELATIVE_COMPUTATION_OOB: the relative address computation overflowed
 * - INVALID_ADDRESS_AFTER_INDIRECTION: the address obtained after applying indirection is invalid
 * Note: We do not stop processing the other operands if an error occurs as we need
 * error information for each operand in the event to correctly perform the trace generation.
 */
std::vector<Operand> Addressing::resolve(const Instruction& instruction, MemoryInterface& memory)
{
    BB_BENCH_NAME("Addressing::resolve");
    // We'll be filling in the event as we progress.
    AddressingEvent event;
    // We initialize all the phases with the original operands.
    // This is expected for non-address (i.e., immediate) operands.
    // For address operands, we'll update them as we go.
    for (const auto& operand : instruction.operands) {
        event.resolution_info.push_back({
            .after_relative = operand.as_ff(),
            .resolved_operand = operand,
            .error = std::nullopt,
        });
    }

    // Note: it's fine to query instruction info here since it does not trigger events.
    // Also, if addressing is being resolved, we can assume that instruction fetching succeeded.
    ExecutionOpCode exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
    const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);

    // This represents either: (1) wrong info in the spec, or (2) a wrong witgen deserialization.
    // Therefore, it is not an error the circuit should be able to prove.
    assert(spec.num_addresses <= instruction.operands.size());

    // Check if there is any relative address.
    bool has_relative_address = false;
    for (size_t i = 0; i < spec.num_addresses; ++i) {
        if (is_operand_relative(instruction.indirect, i)) {
            has_relative_address = true;
            break;
        }
    }

    // If there is a relative address, we resolve the base address.
    // We check the tag of the resolved base address and keep this information for later use.
    bool base_address_invalid = false;
    std::optional<MemoryValue> base_address;
    if (has_relative_address) {
        base_address = memory.get(0);
        event.base_address = *base_address;
        // Check if the base address is valid (has the right tag).
        if (!memory.is_valid_address(*base_address)) {
            base_address_invalid = true;
        }
    }

    // We process each address separately.
    // Even if one fails, we continue processing the other ones. We will throw an exception after event emission.
    // This is to simplify error handling in the circuit.
    for (size_t i = 0; i < spec.num_addresses; ++i) {
        auto& resolution_info = event.resolution_info[i];
        try {
            // Simulation and the circuit assume that the operands are valid addresses.
            // This should be guaranteed by instruction fetching and the wire format.
            // The operand must fit in a MemoryAddress but does not need to be of the right tag.
            // For instance, a 16-bit operand can be cast to a MemoryAddress and fit.
            assert(FF(static_cast<MemoryAddress>(instruction.operands[i].as_ff())) == instruction.operands[i].as_ff());

            // Guarantees at this point:
            // - original operand is a valid address IF interpreted as a MemoryAddress.

            // Check if the base address is invalid. Even for non-relative addresses, we need to check this because
            // we essentially stop any resolution if the base address is invalid and a relative address is used.
            if (base_address_invalid) {
                throw AddressingEventError::BASE_ADDRESS_INVALID;
            }

            // Process relative addressing if applicable.
            // That is, if relative addressing is used, after_relative[i] = base_address + operands[i].
            // Note that the operands were stored as is, and then we'll update them if they are relative.
            // Namely, the above initialization guarantees:
            // resolution_info.after_relative = instruction.operands[i].as_ff(); // default value if not relative.
            if (is_operand_relative(instruction.indirect, i)) {
                // We extend the address to uint64_t to avoid overflows.
                auto offset = static_cast<uint64_t>(resolution_info.after_relative);
                // Note: Since we know that the offset and the base address are valid, the addition fits in 33 bits.
                offset += (*base_address).to<uint64_t>();
                // We store the offset as FF. If the circuit needs to prove overflow, it will
                // need the full value.
                resolution_info.after_relative = FF(offset);
                // Check whether the relative address overflows.
                if (is_address_out_of_range(offset)) {
                    // We need to update the default value for the resolved operand to the overflowed value.
                    // This is required for the circuit to be on par with the behavior of immediate operands.
                    // In this case, the tag of the resolved operand is not constrained.
                    resolution_info.resolved_operand = Operand::from_tag(ValueTag::FF, FF(offset));
                    // If this happens, it means that the relative computation overflowed. However, both the base and
                    // operand addresses by themselves were valid.
                    throw AddressingEventError::RELATIVE_COMPUTATION_OOB;
                }
            }

            // Guarantees at this point:
            // - original operand is a valid address IF interpreted as MemoryAddress.
            // - after_relative is in the valid address range.

            // Then indirection.
            // That is, if indirection is used, resolved_operands[i] = memory[after_relative[i]].
            // We first store the after_relative values as is, and then we'll update them if they are indirect.
            resolution_info.resolved_operand =
                Operand::from(static_cast<MemoryAddress>(resolution_info.after_relative));
            if (is_operand_indirect(instruction.indirect, i)) {
                resolution_info.resolved_operand =
                    memory.get(static_cast<MemoryAddress>(resolution_info.after_relative));
                // Check the tag of the resolved operand.
                if (!memory.is_valid_address(resolution_info.resolved_operand)) {
                    throw AddressingEventError::INVALID_ADDRESS_AFTER_INDIRECTION;
                }
            }

            // Guarantees at this point:
            // - original operand is a valid address IF interpreted as MemoryAddress.
            // - after_relative is in the valid address range.
            // - resolved_operand is a valid address.
        } catch (const AddressingEventError& e) {
            vinfo("Addressing error: ", to_string(e), " at operand ", i);
            vinfo("Base address: ", event.base_address.to_string());
            vinfo("After relative: ", resolution_info.after_relative);
            vinfo("Resolved operand: ", resolution_info.resolved_operand.to_string());
            resolution_info.error = e;
        }
    }

    events.emit(AddressingEvent(event));

    // If any entry in resolution_info has an error set, throw.
    if (std::ranges::any_of(event.resolution_info, [](const auto& info) { return info.error.has_value(); })) {
        // Signal the error to the caller.
        // Detailed information is already logged above.
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

/**
 * @brief Checks if an address as uint64_t is out of range. Emits a gt event comparing the address to
 * AVM_HIGHEST_MEM_ADDRESS.
 *
 * @param address as uint64_t
 * @return true if the address is out of range, false otherwise
 */
bool Addressing::is_address_out_of_range(uint64_t address)
{
    return gt.gt(address, AVM_HIGHEST_MEM_ADDRESS);
}

} // namespace bb::avm2::simulation
