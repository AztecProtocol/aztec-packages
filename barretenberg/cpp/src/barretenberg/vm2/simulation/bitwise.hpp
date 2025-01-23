#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/context.hpp"
#include "barretenberg/vm2/simulation/events/bitwise_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class BitwiseInterface {
  public:
    virtual ~BitwiseInterface() = default;
    virtual void op_and(ContextInterface&, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr) = 0;
};

class Bitwise : public BitwiseInterface {
  public:
    Bitwise(EventEmitterInterface<BitwiseEvent>& event_emitter)
        : events(event_emitter)
    {}

    // Operands are expected to be direct.
    void op_and(ContextInterface& context, MemoryAddress a_addr, MemoryAddress b_addr, MemoryAddress dst_addr) override;

  private:
    EventEmitterInterface<BitwiseEvent>& events;
};

} // namespace bb::avm2::simulation