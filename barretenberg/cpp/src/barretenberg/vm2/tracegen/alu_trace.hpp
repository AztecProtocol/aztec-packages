#pragma once

#include "barretenberg/vm2/generated/columns.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

class AluTraceBuilder final {
  public:
    AluTraceBuilder();
    void process(const simulation::EventEmitterInterface<simulation::AluEvent>::Container& events,
                 TraceContainer& trace);

    static const InteractionDefinition interactions;

  private:
    static constexpr size_t NUM_TAGS = static_cast<size_t>(MemoryTag::MAX) + 1;
    // Precomputed inverses for tag values.
    std::array<FF, NUM_TAGS> tag_inverses;
    std::vector<std::pair<Column, FF>> get_operation_specific_columns(const simulation::AluEvent& event) const;
    FF get_tag_diff_inverse(const MemoryTag a_tag, const MemoryTag b_tag) const;
    std::vector<std::pair<Column, FF>> get_tag_error_columns(const simulation::AluEvent& event) const;
};

} // namespace bb::avm2::tracegen
