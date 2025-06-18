#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class ToRadixTraceBuilder final {
  public:
    void process(const simulation::EventEmitterInterface<simulation::ToRadixEvent>::Container& events,
                 TraceContainer& trace);

    static std::vector<std::unique_ptr<class InteractionBuilderInterface>> lookup_jobs()
    {
        return interactions.get_all_jobs();
    }
    template <typename InteractionSettings> static std::unique_ptr<class InteractionBuilderInterface> get_strict_job()
    {
        return interactions.get_strict_job<InteractionSettings>();
    }

  private:
    static const InteractionDefinition interactions;
};

} // namespace bb::avm2::tracegen
