#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/alu.hpp"

namespace bb::avm2::simulation {

class PureAlu : public AluInterface {
  public:
    PureAlu() = default;
    ~PureAlu() override = default;

    // Disable copy and move operations
    PureAlu(const PureAlu&) = delete;
    PureAlu& operator=(const PureAlu&) = delete;
    PureAlu(PureAlu&&) = delete;
    PureAlu& operator=(PureAlu&&) = delete;

    MemoryValue add(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue sub(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue mul(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue div(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue fdiv(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue eq(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue lt(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue lte(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue op_not(const MemoryValue& a) override;
    MemoryValue truncate(const FF& a, MemoryTag dst_tag) override;
    MemoryValue shr(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue shl(const MemoryValue& a, const MemoryValue& b) override;
};

} // namespace bb::avm2::simulation
