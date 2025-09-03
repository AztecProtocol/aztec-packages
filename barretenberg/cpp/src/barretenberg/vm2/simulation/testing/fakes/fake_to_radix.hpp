#pragma once

#include "barretenberg/vm2/simulation/to_radix.hpp"

#include "barretenberg/vm2/common/field.hpp"
#include <stdexcept>

namespace bb::avm2::simulation {

class FakeToRadix : public ToRadixInterface {
  public:
    FakeToRadix() = default;
    ~FakeToRadix() override = default;

    std::vector<uint8_t> to_le_radix(const FF& value, uint32_t num_limbs, uint32_t radix) override;
    std::vector<bool> to_le_bits(const FF& value, uint32_t num_limbs) override;
    void to_be_radix([[maybe_unused]] MemoryInterface& memory,
                     [[maybe_unused]] const FF& value,
                     [[maybe_unused]] uint32_t radix,
                     [[maybe_unused]] uint32_t num_limbs,
                     [[maybe_unused]] bool is_output_bits,
                     [[maybe_unused]] MemoryAddress dst_addr) override
    {
        throw std::runtime_error("FakeToRadix::to_be_radix is not implemented");
    }
};

} // namespace bb::avm2::simulation
