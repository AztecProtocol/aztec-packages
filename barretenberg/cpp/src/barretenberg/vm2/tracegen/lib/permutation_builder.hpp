#pragma once

#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

// This class is only needed to set the correct size of the inverse column.
// TODO: In the future we'll repurpose this class to keep track of the active rows,
// and let the provers use it to more efficiently compute the inverses.
template <typename PermutationSettings> class PermutationBuilder : public InteractionBuilderInterface {
  public:
    void process(TraceContainer& trace) override { SetDummyInverses<PermutationSettings>(trace); }
};

} // namespace bb::avm2::tracegen
