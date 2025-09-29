#pragma once

#include "barretenberg/vm2/tracegen/lib/interaction_builder.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

template <typename PermutationSettings> class PermutationBuilder : public InteractionBuilderInterface {
  public:
    void process(TraceContainer&) override
    {
        // There's nothing to do here.
        // We only keep this class around so that in tests we can use the checked version.
    }
};

} // namespace bb::avm2::tracegen
