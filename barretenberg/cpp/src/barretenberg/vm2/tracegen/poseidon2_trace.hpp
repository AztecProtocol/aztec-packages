#pragma once

#include <memory>

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/poseidon2_event.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class Poseidon2TraceBuilder final {
  public:
    void process_hash(const simulation::EventEmitterInterface<simulation::Poseidon2HashEvent>::Container& hash_events,
                      TraceContainer& trace);
    void process_permutation(
        const simulation::EventEmitterInterface<simulation::Poseidon2PermutationEvent>::Container& perm_events,
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
