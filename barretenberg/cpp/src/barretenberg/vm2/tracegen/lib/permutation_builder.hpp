#pragma once

#include <array>
#include <cstddef>
#include <stdexcept>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// This class is only needed to set the correct size of the inverse column.
// TODO: In the future we'll repurpose this class to keep track of the active rows,
// and let the provers use it to more efficiently compute the inverses.
template <typename PermutationSettings> class PermutationBuilder {
  public:
    void process(TraceContainer& trace)
    {
        // Let "src_sel {c1, c2, ...} is dst_sel {d1, d2, ...}" be a permutation.
        trace.visit_column(PermutationSettings::SRC_SELECTOR, [&](uint32_t row, const FF& src_sel_value) {
            assert(src_sel_value == 1);
            (void)src_sel_value; // Avoid GCC complaining of unused parameter when asserts are disabled.

            // We set a dummy value in the inverse column so that the size of the column is right.
            // The correct value will be set by the prover.
            trace.set(PermutationSettings::INVERSES, row, 0xdeadbeef);
        });

        // We set a dummy value in the inverse column so that the size of the column is right.
        // The correct value will be set by the prover.
        trace.visit_column(PermutationSettings::DST_SELECTOR,
                           [&](uint32_t row, const FF&) { trace.set(PermutationSettings::INVERSES, row, 0xdeadbeef); });
    }
};

} // namespace bb::avm2::tracegen