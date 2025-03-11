#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"

#include "barretenberg/vm/aztec_constants.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

void ClassIdDerivationTraceBuilder::process(
    const simulation::EventEmitterInterface<simulation::ClassIdDerivationEvent>::Container& events,
    TraceContainer& trace)
{
    using C = Column;

    uint32_t row = 0;
    for (const auto& event : events) {
        trace.set(row,
                  { {
                      { C::class_id_derivation_sel, 1 },
                      { C::class_id_derivation_class_id, event.class_id },
                      { C::class_id_derivation_artifact_hash, event.klass.artifact_hash },
                      { C::class_id_derivation_private_function_root, event.klass.private_function_root },
                      { C::class_id_derivation_public_bytecode_commitment, event.klass.public_bytecode_commitment },

                      // This is temp because aliasing is not allowed in lookups
                      { C::class_id_derivation_temp_constant_for_lookup, GENERATOR_INDEX__CONTRACT_LEAF },
                  } });
        row++;
    }
}
} // namespace bb::avm2::tracegen
