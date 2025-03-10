#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/to_radix.hpp"

namespace bb::avm2::simulation {

class MockToRadix : public ToRadixInterface {
  public:
    MockToRadix();
    ~MockToRadix() override;

    MOCK_METHOD((std::vector<uint8_t>), to_le_radix, (const FF& value, uint32_t num_limbs, uint32_t radix), (override));
    MOCK_METHOD((std::vector<bool>), to_le_bits, (const FF& value, uint32_t num_limbs), (override));
};

} // namespace bb::avm2::simulation
