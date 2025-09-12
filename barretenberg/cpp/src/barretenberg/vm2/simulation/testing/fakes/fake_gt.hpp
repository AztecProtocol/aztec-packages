#pragma once

#include "barretenberg/vm2/simulation/gt.hpp"

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

class FakeGreaterThan : public GreaterThanInterface {
  public:
    FakeGreaterThan() = default;
    ~FakeGreaterThan() override = default;

    bool gt(const FF& a, const FF& b) override;
    bool gt(const uint128_t& a, const uint128_t& b) override;
    bool gt(const MemoryValue& a, const MemoryValue& b) override;
};

} // namespace bb::avm2::simulation
