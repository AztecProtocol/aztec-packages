#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/bitwise.hpp"

namespace bb::avm2::simulation {

class MockBitwise : public BitwiseInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockBitwise();
    ~MockBitwise() override;

    MOCK_METHOD(MemoryValue, and_op, (const MemoryValue& a, const MemoryValue& b), (override));
    MOCK_METHOD(MemoryValue, or_op, (const MemoryValue& a, const MemoryValue& b), (override));
    MOCK_METHOD(MemoryValue, xor_op, (const MemoryValue& a, const MemoryValue& b), (override));
};

} // namespace bb::avm2::simulation
