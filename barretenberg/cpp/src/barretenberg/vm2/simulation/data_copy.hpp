#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/range_check.hpp"

namespace bb::avm2::simulation {

class DataCopyInterface {
  public:
    virtual ~DataCopyInterface() = default;
    virtual void cd_copy(ContextInterface& context,
                         const MemoryValue& cd_copy_size,
                         const MemoryValue& cd_offset,
                         const MemoryAddress dst_addr) = 0;
    virtual void rd_copy(ContextInterface& context,
                         const MemoryValue& rd_copy_size,
                         const MemoryValue& rd_offset,
                         const MemoryAddress dst_addr) = 0;
};

class DataCopy : public DataCopyInterface {
  public:
    DataCopy(ExecutionIdGetterInterface& execution_id_manager,
             RangeCheckInterface& range_check,
             EventEmitterInterface<DataCopyEvent>& event_emitter)
        : execution_id_manager(execution_id_manager)
        , range_check(range_check)
        , events(event_emitter)
    {}

    void cd_copy(ContextInterface& context,
                 const MemoryValue& cd_copy_size,
                 const MemoryValue& cd_offset,
                 const MemoryAddress dst_addr) override;
    void rd_copy(ContextInterface& context,
                 const MemoryValue& rd_copy_size,
                 const MemoryValue& rd_offset,
                 const MemoryAddress dst_addr) override;

  private:
    bool is_lte(const uint64_t a, uint64_t b);
    uint64_t min(uint64_t a, uint64_t b);

    ExecutionIdGetterInterface& execution_id_manager;
    RangeCheckInterface& range_check;
    EventEmitterInterface<DataCopyEvent>& events;
};

} // namespace bb::avm2::simulation
