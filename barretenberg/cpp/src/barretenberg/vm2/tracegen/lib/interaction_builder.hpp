#pragma once

#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class InteractionBuilderInterface {
  public:
    virtual ~InteractionBuilderInterface() = default;
    virtual void process(TraceContainer& trace) = 0;
};

// We set a dummy value in the inverse column so that the size of the column is right.
// The correct value will be set by the prover.
template <typename LookupSettings> void SetDummyInverses(TraceContainer& trace)
{
    trace.visit_column(LookupSettings::SRC_SELECTOR,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
    trace.visit_column(LookupSettings::DST_SELECTOR,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
}

} // namespace bb::avm2::tracegen
