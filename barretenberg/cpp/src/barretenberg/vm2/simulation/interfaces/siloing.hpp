#pragma once

#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class SiloingInterface {
  public:
    virtual ~SiloingInterface() = default;
    virtual FF silo_nullifier(const FF& nullifier, const FF& silo_by) = 0;
};

} // namespace bb::avm2::simulation
