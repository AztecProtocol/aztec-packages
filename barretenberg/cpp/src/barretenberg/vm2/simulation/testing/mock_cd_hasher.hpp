#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/calldata_hashing.hpp"

namespace bb::avm2::simulation {

class MockCalldataHasher : public CalldataHashingInterface {
  public:
    MockCalldataHasher();
    ~MockCalldataHasher() override;

    MOCK_METHOD(FF, compute_calldata_hash, (const std::span<const FF> calldata), (override));
};
} // namespace bb::avm2::simulation
