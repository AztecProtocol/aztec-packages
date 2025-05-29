#pragma once

#include <cstddef>
#include <cstdint>

namespace bb::avm2 {

bool is_operand_relative(uint16_t indirect_flag, size_t operand_index)
{
    return ((indirect_flag >> (operand_index * 2 + 1)) & 1) != 0;
}
bool is_operand_indirect(uint16_t indirect_flag, size_t operand_index)
{
    return ((indirect_flag >> (operand_index * 2)) & 1) != 0;
}

} // namespace bb::avm2
