#pragma once

#include <cstddef>
#include <cstdint>

namespace bb::avm2 {

/**
 * @brief Checks if the operand at the given index is relative.
 * @param indirect_flag the indirect flag from the instruction
 * @param operand_index the index of the operand
 * @return true if the operand is relative, false otherwise
 * @precondition operand_index < 8 otherwise the behavior is undefined (cpp shift behaviour).
 */
inline bool is_operand_relative(uint16_t indirect_flag, size_t operand_index)
{
    return ((indirect_flag >> (operand_index * 2 + 1)) & 1) != 0;
}

/**
 * @brief Checks if the operand at the given index is indirect.
 * @param indirect_flag the indirect flag from the instruction
 * @param operand_index the index of the operand
 * @return true if the operand is indirect, false otherwise
 * @precondition operand_index < 8 otherwise the behavior is undefined (cpp shift behaviour).
 */
inline bool is_operand_indirect(uint16_t indirect_flag, size_t operand_index)
{
    return ((indirect_flag >> (operand_index * 2)) & 1) != 0;
}

} // namespace bb::avm2
