#include "barretenberg/vm2/tracegen/class_id_derivation_trace.hpp"

#include <memory>

#include "barretenberg/aztec/aztec_constants.hpp"
#include "barretenberg/vm2/generated/relations/lookups_class_id_derivation.hpp"
#include "barretenberg/vm2/simulation/events/class_id_derivation_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/tracegen/lib/interaction_def.hpp"
#include "barretenberg/vm2/tracegen/trace_container.hpp"

namespace bb::avm2::tracegen {

/**
 * @brief Process class id derivation events and populate the relevant columns in the trace.
 *  Corresponds to the subtrace class_id_derivation.pil.
 *
 *  This trace is non memory-aware and does not handle any errors. It relies on the poseidon trace
 *  to constrain correctness of the class id, given as:
 *      Poseidon2(DOM_SEP__CONTRACT_CLASS_ID, artifact_hash, private_functions_root, public_bytecode_commitment)
 *
 * @param events The container of class id derivation events to process.
 * @param trace The trace container.
 */
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
                      // Class ID.
                      { C::class_id_derivation_class_id, event.class_id },
                      // Class members.
                      { C::class_id_derivation_artifact_hash, event.artifact_hash },
                      { C::class_id_derivation_private_functions_root, event.private_functions_root },
                      { C::class_id_derivation_public_bytecode_commitment, event.public_bytecode_commitment },
                      // Constant columns (this is temp because aliasing is not allowed in lookups).
                      { C::class_id_derivation_gen_index_contract_class_id, DOM_SEP__CONTRACT_CLASS_ID },
                      { C::class_id_derivation_const_four, 4 },
                  } });
        row++;
    }
}

const InteractionDefinition ClassIdDerivationTraceBuilder::interactions =
    InteractionDefinition()
        .add<InteractionType::LookupSequential, lookup_class_id_derivation_class_id_poseidon2_0_settings>()
        .add<InteractionType::LookupSequential, lookup_class_id_derivation_class_id_poseidon2_1_settings>();

} // namespace bb::avm2::tracegen
