#include "barretenberg/vm2/common/gas.hpp"

#include <cstddef>

#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2 {

uint32_t compute_addressing_gas(uint16_t indirect_flag)
{
    uint32_t indirect_operand_count = 0;
    uint32_t relative_operand_count = 0;

    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        if (is_operand_indirect(indirect_flag, i)) {
            indirect_operand_count++;
        }
        if (is_operand_relative(indirect_flag, i)) {
            relative_operand_count++;
        }
    }

    return (relative_operand_count != 0 ? AVM_ADDRESSING_BASE_RESOLUTION_L2_GAS : 0) +
           (indirect_operand_count * AVM_ADDRESSING_INDIRECT_L2_GAS) +
           (relative_operand_count * AVM_ADDRESSING_RELATIVE_L2_GAS);
}

} // namespace bb::avm2
