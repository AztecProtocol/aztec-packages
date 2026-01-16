#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/calldata_hashing.hpp"

namespace bb::avm2::simulation {

class MockCalldataHasher : public CalldataHashingInterface {
  public:
    MockCalldataHasher();
    ~MockCalldataHasher() override;

    MOCK_METHOD(void, assert_calldata_hash, (const FF& cd_hash, std::span<const FF> calldata), (override));
};
} // namespace bb::avm2::simulation
