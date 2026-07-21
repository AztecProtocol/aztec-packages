#pragma once

#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Trace builder for the bitwise subtrace (AND/OR/XOR operations).
 */
class BitwiseTraceBuilder final {
  public:
    /**
     * @brief Populate the bitwise trace columns from simulation events.
     *
     * @param events Container of BitwiseEvent from simulation (success and error events).
     * @param trace The trace container to populate with bitwise columns.
     */
    void process(const simulation::EventEmitterInterface<simulation::BitwiseEvent>::Container& events,
                 TraceContainer& trace);

    /// @brief Interaction definitions for outbound lookups (BYTE_OPERATIONS, INTEGRAL_TAG_LENGTH).
    static const InteractionDefinition interactions;
};

} // namespace bb::avm2::tracegen
