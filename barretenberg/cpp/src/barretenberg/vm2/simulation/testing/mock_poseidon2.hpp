#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/poseidon2.hpp"

namespace bb::avm2::simulation {

class MockPoseidon2 : public Poseidon2Interface {
  public:
    MockPoseidon2();
    ~MockPoseidon2() override;

    MOCK_METHOD(FF, hash, (const std::vector<FF>& input), (override));
    MOCK_METHOD((std::array<FF, 4>), permutation, ((const std::array<FF, 4>)&input), (override));
};

} // namespace bb::avm2::simulation
