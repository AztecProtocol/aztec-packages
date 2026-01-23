#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class UpdateCheckInterface {
  public:
    virtual ~UpdateCheckInterface() = default;
    virtual void check_current_class_id(const AztecAddress& address, const ContractInstance& instance) = 0;
};

} // namespace bb::avm2::simulation
