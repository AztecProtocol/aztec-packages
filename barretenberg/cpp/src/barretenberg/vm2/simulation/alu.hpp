#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class AluInterface {
  public:
    virtual ~AluInterface() = default;
    virtual MemoryValue add(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue eq(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue lt(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue lte(const MemoryValue& a, const MemoryValue& b) = 0;
    virtual MemoryValue op_not(const MemoryValue& a) = 0;
};

class Alu : public AluInterface {
  public:
    Alu(GreaterThanInterface& greater_than, EventEmitterInterface<AluEvent>& event_emitter)
        : greater_than(greater_than)
        , events(event_emitter)
    {}

    MemoryValue add(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue eq(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue lt(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue lte(const MemoryValue& a, const MemoryValue& b) override;
    MemoryValue op_not(const MemoryValue& a) override;

  private:
    GreaterThanInterface& greater_than;
    EventEmitterInterface<AluEvent>& events;
};

} // namespace bb::avm2::simulation
