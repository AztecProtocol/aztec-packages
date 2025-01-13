#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/alu_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class AluInterface {
  public:
    virtual ~AluInterface() = default;
    virtual void add(ContextInterface&, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr) = 0;
};

class Alu : public AluInterface {
  public:
    Alu(EventEmitterInterface<AluEvent>& event_emitter)
        : events(event_emitter)
    {}

    // Operands are expected to be direct.
    void add(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr) override;

  private:
    EventEmitterInterface<AluEvent>& events;
};

} // namespace bb::avm2::simulation