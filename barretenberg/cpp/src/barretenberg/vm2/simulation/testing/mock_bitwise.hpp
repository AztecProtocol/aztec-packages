#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/bitwise.hpp"

namespace bb::avm2::simulation {

class MockBitwise : public BitwiseInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockBitwise();
    ~MockBitwise() override;

    MOCK_METHOD(uint128_t, and_op, (MemoryTag tag, const uint128_t& a, const uint128_t& b), (override));
    MOCK_METHOD(uint128_t, or_op, (MemoryTag tag, const uint128_t& a, const uint128_t& b), (override));
    MOCK_METHOD(uint128_t, xor_op, (MemoryTag tag, const uint128_t& a, const uint128_t& b), (override));
};

} // namespace bb::avm2::simulation