#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/data_copy_events.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"

namespace bb::avm2::simulation {

class DataCopyInterface {
  public:
    virtual ~DataCopyInterface() = default;
    virtual void cd_copy(ContextInterface& context,
                         const uint32_t cd_copy_size,
                         const uint32_t cd_offset,
                         const MemoryAddress dst_addr) = 0;
    virtual void rd_copy(ContextInterface& context,
                         const uint32_t rd_copy_size,
                         const uint32_t rd_offset,
                         const MemoryAddress dst_addr) = 0;
};

class DataCopy : public DataCopyInterface {
  public:
    DataCopy(EventEmitterInterface<DataCopyEvent>& event_emitter)
        : events(event_emitter)
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
    EventEmitterInterface<DataCopyEvent>& events;
};

} // namespace bb::avm2::simulation
