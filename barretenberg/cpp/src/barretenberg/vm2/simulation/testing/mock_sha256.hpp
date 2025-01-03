#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/sha256_compression.hpp"

namespace bb::avm2::simulation {

class MockSha256 : public Sha256Interface {
  public:
    MockSha256();
    ~MockSha256() override;

    MOCK_METHOD(void,
                compression,
                (ContextInterface&, MemoryAddress state_addr, MemoryAddress input_addr, MemoryAddress output_addr),
                (override));
};

} // namespace bb::avm2::simulation
