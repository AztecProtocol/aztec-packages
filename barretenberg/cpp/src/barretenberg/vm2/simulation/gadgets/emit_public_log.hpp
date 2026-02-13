#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/emit_public_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/interfaces/emit_public_log.hpp"
#include "barretenberg/vm2/simulation/interfaces/gt.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

class EmitPublicLog : public EmitPublicLogInterface, public CheckpointNotifiable {
  public:
    EmitPublicLog(ExecutionIdManagerInterface& execution_id_manager,
                  GreaterThanInterface& greater_than,
                  EventEmitterInterface<EmitPublicLogEvent>& events)
        : execution_id_manager(execution_id_manager)
        , greater_than(greater_than)
        , events(events)
    {}

    void emit_public_log(MemoryInterface& memory,
                         ContextInterface& context,
                         const AztecAddress& contract_address,
                         MemoryAddress log_offset,
                         uint32_t log_size) override;

    void on_checkpoint_created() override;
    void on_checkpoint_committed() override;
    void on_checkpoint_reverted() override;

  private:
    ExecutionIdManagerInterface& execution_id_manager;
    GreaterThanInterface& greater_than;
    EventEmitterInterface<EmitPublicLogEvent>& events;
};

} // namespace bb::avm2::simulation
