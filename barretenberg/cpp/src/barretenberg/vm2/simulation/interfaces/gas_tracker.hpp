#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class GasTrackerInterface {
  public:
    virtual ~GasTrackerInterface() = default;
    // @throws OutOfGasException.
    virtual void consume_gas(const Gas& dynamic_gas_factor = { 0, 0 }) = 0;

    virtual Gas compute_gas_limit_for_call(const Gas& allocated_gas) = 0;
};

} // namespace bb::avm2::simulation
