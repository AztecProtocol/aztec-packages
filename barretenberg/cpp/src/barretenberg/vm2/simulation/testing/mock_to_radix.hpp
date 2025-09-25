#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/to_radix.hpp"

namespace bb::avm2::simulation {

class MockToRadix : public ToRadixInterface {
  public:
    MockToRadix();
    ~MockToRadix() override;

    MOCK_METHOD((std::pair<std::vector<uint8_t>, /* truncated */ bool>),
                to_le_radix,
                (const FF& value, uint32_t num_limbs, uint32_t radix),
                (override));
    MOCK_METHOD((std::pair<std::vector<bool>, /* truncated */ bool>),
                to_le_bits,
                (const FF& value, uint32_t num_limbs),
                (override));
    MOCK_METHOD(void,
                to_be_radix,
                (MemoryInterface & memory,
                 const FF& value,
                 uint32_t radix,
                 uint32_t num_limbs,
                 bool is_output_bits,
                 MemoryAddress dst_addr),
                (override));
};

} // namespace bb::avm2::simulation
