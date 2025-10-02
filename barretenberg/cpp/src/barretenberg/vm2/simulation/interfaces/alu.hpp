#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

class AluInterface {
  public:
    virtual ~AluInterface() = default;
    virtual MemoryValue add(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue sub(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue mul(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue div(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue fdiv(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue eq(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue lt(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue lte(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue op_not(const MemoryValue& a) = 0;
    virtual MemoryValue truncate(const FF& a, MemoryTag dst_tag) = 0;
    virtual MemoryValue shr(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue shl(const MemoryValue& a, const MemoryValue& b) = 0;
};

class AluException : public std::runtime_error {
  public:
    explicit AluException(const std::string& message)
        : std::runtime_error("ALU Exception: " + message)
    {}
};

} // namespace bb::avm2::simulation
