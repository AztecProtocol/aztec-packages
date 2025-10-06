#pragma once

#include "barretenberg/vm2/simulation/interfaces/update_check.hpp"

namespace bb::avm2::simulation {

class NoopUpdateCheck : public UpdateCheckInterface {
  public:
    void check_current_class_id(const AztecAddress&, const ContractInstance&) override {}
};

} // namespace bb::avm2::simulation
