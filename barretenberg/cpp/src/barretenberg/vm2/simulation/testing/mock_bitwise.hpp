#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/bitwise.hpp"

namespace bb::avm2::simulation {

class MockBitwise : public BitwiseInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockBitwise();
    ~MockBitwise() override;

    MOCK_METHOD(void, and_op, (MemoryTag tag, uint128_t a, uint128_t b, uint128_t c), (override));
    MOCK_METHOD(void, or_op, (MemoryTag tag, uint128_t a, uint128_t b, uint128_t c), (override));
    MOCK_METHOD(void, xor_op, (MemoryTag tag, uint128_t a, uint128_t b, uint128_t c), (override));
};

} // namespace bb::avm2::simulation