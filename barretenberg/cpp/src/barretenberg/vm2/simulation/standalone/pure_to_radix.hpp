#pragma once

#include "barretenberg/vm2/simulation/interfaces/to_radix.hpp"

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class PureToRadix : public ToRadixInterface {
  public:
    PureToRadix() = default;
    ~PureToRadix() override = default;

    std::pair<std::vector<uint8_t>, /* truncated */ bool> to_le_radix(const FF& value,
                                                                      uint32_t num_limbs,
                                                                      uint32_t radix) override;
    std::pair<std::vector<bool>, /* truncated */ bool> to_le_bits(const FF& value, uint32_t num_limbs) override;
    void to_be_radix(MemoryInterface& memory,
                     const FF& value,
                     uint32_t radix,
                     uint32_t num_limbs,
                     bool is_output_bits,
                     MemoryAddress dst_addr) override;
};

} // namespace bb::avm2::simulation
