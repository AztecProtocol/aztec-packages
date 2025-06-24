#pragma once

#include <array>
#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/keccakf1600.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class MockKeccakF1600 : public KeccakF1600Interface {
  public:
    MockKeccakF1600();
    ~MockKeccakF1600() override;

    MOCK_METHOD(void,
                permutation,
                (MemoryInterface & memory, MemoryAddress dst_addr, MemoryAddress src_addr),
                (override));
};

} // namespace bb::avm2::simulation
