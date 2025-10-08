#include "barretenberg/vm2/simulation/standalone/pure_addressing.hpp"

#include <algorithm>
#include <cstdint>
#include <vector>

#include "barretenberg/common/bb_bench.hpp"
#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/interfaces/addressing.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

std::vector<Operand> PureAddressing::resolve(const Instruction& instruction, MemoryInterface& memory)
{
    BB_BENCH_NAME("PureAddressing::resolve");

    ExecutionOpCode exec_opcode = instruction_info_db.get(instruction.opcode).exec_opcode;
    const ExecInstructionSpec& spec = instruction_info_db.get(exec_opcode);

    assert(spec.num_addresses <= instruction.operands.size());

    std::optional<MemoryAddress> base_address;
    std::vector<Operand> resolved_operands = instruction.operands;

    for (size_t i = 0; i < spec.num_addresses; ++i) {
        Operand& operand = resolved_operands[i];
        const ValueTag tag = operand.get_tag();

        // We assume from serialization that the operand is <= the bits of a memory address.
        // We assert this here as it is a precondition.
        assert(get_tag_bits(tag) <= get_tag_bits(MemoryAddressTag));
        // Normalize possibly smaller sizes to MemoryAddress.
        if (tag != MemoryAddressTag) {
            operand = Operand::from(static_cast<MemoryAddress>(operand.to<MemoryAddress>()));
        }

        // Handle relative addressing
        if (is_operand_relative(instruction.indirect, i)) {
            if (!base_address) {
                MemoryValue maybe_base_address = memory.get(0);
                if (!memory.is_valid_address(maybe_base_address)) {
                    throw AddressingException();
                }
                base_address = maybe_base_address.as<MemoryAddress>();
            }
            uint64_t offset = operand.as<MemoryAddress>();
            offset += *base_address;
            if (offset > AVM_HIGHEST_MEM_ADDRESS) {
                throw AddressingException();
            }
            operand = Operand::from(static_cast<MemoryAddress>(offset));
        }

        // Handle indirection
        if (is_operand_indirect(instruction.indirect, i)) {
            const MemoryValue& indirect_value = memory.get(operand.as<MemoryAddress>());
            if (!memory.is_valid_address(indirect_value)) {
                throw AddressingException();
            }
            operand = indirect_value;
        }
    }

    return resolved_operands;
}

} // namespace bb::avm2::simulation
