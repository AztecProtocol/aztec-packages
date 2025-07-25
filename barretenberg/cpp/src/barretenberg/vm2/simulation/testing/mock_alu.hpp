#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/alu.hpp"
#include "barretenberg/vm2/simulation/context.hpp"

namespace bb::avm2::simulation {

class MockAlu : public AluInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockAlu();
    ~MockAlu() override;

    MOCK_METHOD(MemoryValue, add, (const MemoryValue& a, const MemoryValue& b), (override));
    MOCK_METHOD(MemoryValue, mul, (const MemoryValue& a, const MemoryValue& b), (override));
    MOCK_METHOD(MemoryValue, eq, (const MemoryValue& a, const MemoryValue& b), (override));
    MOCK_METHOD(MemoryValue, lt, (const MemoryValue& a, const MemoryValue& b), (override));
    MOCK_METHOD(MemoryValue, lte, (const MemoryValue& a, const MemoryValue& b), (override));
    MOCK_METHOD(MemoryValue, op_not, (const MemoryValue& a), (override));
    MOCK_METHOD(MemoryValue, truncate, (const FF& a, MemoryTag dst_tag), (override));
};

} // namespace bb::avm2::simulation
