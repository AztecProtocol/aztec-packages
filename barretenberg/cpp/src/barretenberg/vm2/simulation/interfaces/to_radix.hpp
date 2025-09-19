#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

// Forward declarations
class MemoryInterface;

class ToRadixInterface {
  public:
    virtual ~ToRadixInterface() = default;
    virtual std::vector<uint8_t> to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix) = 0;
    virtual std::vector<bool> to_le_bits(const FF& value, uint32_t num_limbs) = 0;
    virtual void to_be_radix(MemoryInterface& memory,
                             const FF& value,
                             uint32_t radix,
                             uint32_t num_limbs,
                             bool is_output_bits,
                             MemoryAddress dst_addr) = 0;
};

} // namespace bb::avm2::simulation
