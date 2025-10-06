#pragma once

#include "barretenberg/vm2/simulation/interfaces/gt.hpp"

#include "barretenberg/numeric/uint128/uint128.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/tagged_value.hpp"

namespace bb::avm2::simulation {

class PureGreaterThan : public GreaterThanInterface {
  public:
    PureGreaterThan() = default;
    ~PureGreaterThan() override = default;

    bool gt(const FF& a, const FF& b) override { return static_cast<uint256_t>(a) > static_cast<uint256_t>(b); }
    bool gt(const uint128_t& a, const uint128_t& b) override { return a > b; }
    bool gt(const MemoryValue& a, const MemoryValue& b) override { return a > b; }
};

} // namespace bb::avm2::simulation
