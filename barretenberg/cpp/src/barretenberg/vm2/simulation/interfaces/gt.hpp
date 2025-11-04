#pragma once

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"

namespace bb::avm2::simulation {

class GreaterThanInterface {
  public:
    virtual ~GreaterThanInterface() = default;
    virtual bool gt(const FF& a, const FF& b) = 0;
    virtual bool gt(const uint128_t& a, const uint128_t& b) = 0;
    virtual bool gt(const MemoryValue& a, const MemoryValue& b) = 0;
};

} // namespace bb::avm2::simulation
