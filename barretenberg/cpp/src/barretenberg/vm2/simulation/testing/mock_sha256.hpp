#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"
#include "barretenberg/vm2/simulation/interfaces/sha256.hpp"

namespace bb::avm2::simulation {

class MockSha256 : public Sha256Interface {
  public:
    MockSha256();
    ~MockSha256() override;

    MOCK_METHOD(void,
                compression,
                (MemoryInterface&, MemoryAddress state_addr, MemoryAddress input_addr, MemoryAddress output_addr),
                (override));
};

} // namespace bb::avm2::simulation
