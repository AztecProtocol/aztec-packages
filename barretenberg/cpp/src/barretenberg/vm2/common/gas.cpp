#include "barretenberg/vm2/common/gas.hpp"

#include <cstddef>

#include "barretenberg/vm2/common/addressing.hpp"
#include "barretenberg/vm2/common/aztec_constants.hpp"

namespace bb::avm2 {

/**
 * @brief Computes the gas cost for addressing.
 *
 * @param addressing_mode The addressing mode of the instruction.
 * @return uint16_t The gas cost for addressing.
 */
uint16_t compute_addressing_gas(uint16_t addressing_mode)
{
    // Check that the addressing gas cost fits in 16 bits.
    static_assert(AVM_MAX_OPERANDS * (AVM_ADDRESSING_INDIRECT_L2_GAS + AVM_ADDRESSING_RELATIVE_L2_GAS) +
                          AVM_ADDRESSING_BASE_RESOLUTION_L2_GAS <=
                      UINT16_MAX,
                  "Addressing gas cost must fit in 16 bits");

    uint16_t indirect_operand_count = 0;
    uint16_t relative_operand_count = 0;

    for (size_t i = 0; i < AVM_MAX_OPERANDS; i++) {
        if (is_operand_indirect(addressing_mode, i)) {
            indirect_operand_count++;
        }
        if (is_operand_relative(addressing_mode, i)) {
            relative_operand_count++;
        }
    }

    return (relative_operand_count != 0 ? AVM_ADDRESSING_BASE_RESOLUTION_L2_GAS : 0) +
           (indirect_operand_count * AVM_ADDRESSING_INDIRECT_L2_GAS) +
           (relative_operand_count * AVM_ADDRESSING_RELATIVE_L2_GAS);
}

} // namespace bb::avm2
