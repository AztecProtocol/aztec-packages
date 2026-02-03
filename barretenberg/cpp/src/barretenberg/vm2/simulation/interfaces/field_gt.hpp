#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/lib/uint_decomposition.hpp"

namespace bb::avm2::simulation {

class FieldGreaterThanInterface {
  public:
    virtual ~FieldGreaterThanInterface() = default;
    virtual bool ff_gt(const FF& a, const FF& b) = 0;
    virtual U256Decomposition canon_dec(const FF& a) = 0;
};

} // namespace bb::avm2::simulation
