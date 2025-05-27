#include "barretenberg/vm2/common/gas.hpp"

#include <cstddef>

#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2 {

uint32_t compute_addressing_gas(uint16_t indirect_flag)
{
    uint32_t indirect_operand_count = 0;
    uint32_t relative_operand_count = 0;

    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        if (((indirect_flag >> (i * 2)) & 1) != 0) {
            indirect_operand_count++;
        }
        if (((indirect_flag >> (i * 2 + 1)) & 1) != 0) {
            relative_operand_count++;
        }
    }

    return (indirect_operand_count * AVM_ADDRESSING_INDIRECT_L2_GAS) +
           (relative_operand_count * AVM_ADDRESSING_RELATIVE_L2_GAS);
}

} // namespace bb::avm2
