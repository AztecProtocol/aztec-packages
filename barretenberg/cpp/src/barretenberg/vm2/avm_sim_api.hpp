#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"

namespace bb::avm2 {

class AvmSimAPI {
  public:
    using ProvingInputs = AvmProvingInputs;

    AvmSimAPI() = default;

    void simulate_with_hinted_dbs(const AvmProvingInputs& inputs);
};

} // namespace bb::avm2
