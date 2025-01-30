#pragma once

#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class InteractionBuilderInterface {
  public:
    virtual ~InteractionBuilderInterface() = default;
    virtual void process(TraceContainer& trace) = 0;
};

} // namespace bb::avm2::tracegen