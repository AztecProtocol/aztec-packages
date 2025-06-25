#pragma once

#include <gmock/gmock.h>

#include <cstddef>
#include <memory>
#include <span>
#include <vector>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/addressing.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class MockAddressing : public AddressingInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockAddressing();
    ~MockAddressing() override;

    MOCK_METHOD(std::vector<Operand>, resolve, (const Instruction&, MemoryInterface& memory), (override));
};

} // namespace bb::avm2::simulation
