#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/data_copy.hpp"
#include "barretenberg/vm2/simulation/interfaces/gt.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"

namespace bb::avm2::simulation {

class DataCopy : public DataCopyInterface {
  public:
    DataCopy(ExecutionIdGetterInterface& execution_id_manager,
             GreaterThanInterface& gt,
             EventEmitterInterface<DataCopyEvent>& event_emitter)
        : execution_id_manager(execution_id_manager)
        , gt(gt)
        , events(event_emitter)
    {}

    void cd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr) override;
    void rd_copy(ContextInterface& context, uint32_t copy_size, uint32_t offset, MemoryAddress dst_addr) override;

  private:
    uint64_t min(uint64_t a, uint64_t b);

    ExecutionIdGetterInterface& execution_id_manager;
    GreaterThanInterface& gt;
    EventEmitterInterface<DataCopyEvent>& events;
};

} // namespace bb::avm2::simulation
