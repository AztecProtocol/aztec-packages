#pragma once

#include "barretenberg/vm2/simulation/bitwise.hpp"

#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

class FakeBitwise : public BitwiseInterface {
  public:
    FakeBitwise() = default;
    ~FakeBitwise() override = default;

    MemoryValue and_op(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue or_op(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue xor_op(const MemoryValue& a, const MemoryValue& b) override;
};

} // namespace bb::avm2::simulation
