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
// TODO(fcarreiro): support expressions.
template <typename LookupSettings> void SetDummyInversesPermutation(TraceContainer& trace)
{
    trace.visit_column(LookupSettings::SRC_SELECTOR,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
    trace.visit_column(LookupSettings::DST_SELECTOR,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
}

template <typename LookupSettings> void SetDummyInverses(TraceContainer& trace)
{
    // TODO(fcarreiro): support expressions.
    const auto src_selector_col = static_cast<Column>(LookupSettings::SRC_SELECTOR_EXPR.column);
    const auto dst_selector_col = static_cast<Column>(LookupSettings::DST_SELECTOR_EXPR.column);

    trace.visit_column(src_selector_col,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
    trace.visit_column(dst_selector_col,
                       [&](uint32_t row, const FF&) { trace.set(LookupSettings::INVERSES, row, 0xdeadbeef); });
}

} // namespace bb::avm2::tracegen
