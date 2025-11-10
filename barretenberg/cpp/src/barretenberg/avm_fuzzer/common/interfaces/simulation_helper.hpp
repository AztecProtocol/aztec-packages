#pragma once

#include "barretenberg/vm2/simulation_helper.hpp"

namespace bb::avm2::fuzzer {

class FuzzerSimulationHelper : public AvmSimulationHelper {
  public:
    using AvmSimulationHelper::simulate_fast;
};

} // namespace bb::avm2::fuzzer
