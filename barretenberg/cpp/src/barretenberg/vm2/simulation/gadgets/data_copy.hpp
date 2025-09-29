#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gadgets/context.hpp"
#include "barretenberg/vm2/simulation/gadgets/range_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/data_copy.hpp"

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

    void cd_copy(ContextInterface& context,
                 const uint32_t cd_copy_size,
                 const uint32_t cd_offset,
                 const MemoryAddress dst_addr) override;
    void rd_copy(ContextInterface& context,
                 const uint32_t rd_copy_size,
                 const uint32_t rd_offset,
                 const MemoryAddress dst_addr) override;

  private:
    uint64_t min(uint64_t a, uint64_t b);

    ExecutionIdGetterInterface& execution_id_manager;
    GreaterThanInterface& gt;
    EventEmitterInterface<DataCopyEvent>& events;
};

} // namespace bb::avm2::simulation
