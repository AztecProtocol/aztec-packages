#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/emit_unencrypted_log_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/interfaces/emit_unencrypted_log.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

class EmitUnencryptedLog : public EmitUnencryptedLogInterface, public CheckpointNotifiable {
  public:
    EmitUnencryptedLog(ExecutionIdManagerInterface& execution_id_manager,
                       GreaterThanInterface& greater_than,
                       EventEmitterInterface<EmitUnencryptedLogEvent>& events)
        : execution_id_manager(execution_id_manager)
        , greater_than(greater_than)
        , events(events)
    {}

    void emit_unencrypted_log(MemoryInterface& memory,
                              ContextInterface& context,
                              AztecAddress contract_address,
                              MemoryAddress log_offset,
                              uint32_t log_size) override;

    void on_checkpoint_created() override;
    void on_checkpoint_committed() override;
    void on_checkpoint_reverted() override;

  private:
    ExecutionIdManagerInterface& execution_id_manager;
    GreaterThanInterface& greater_than;
    EventEmitterInterface<EmitUnencryptedLogEvent>& events;
};

} // namespace bb::avm2::simulation
