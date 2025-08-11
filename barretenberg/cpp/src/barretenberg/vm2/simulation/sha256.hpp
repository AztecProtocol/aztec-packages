#pragma once

#include <cstdint>
#include <memory>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/bitwise.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/sha256_event.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/lib/execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class Sha256Interface {
  public:
    virtual ~Sha256Interface() = default;
    virtual void compression(MemoryInterface&,
                             MemoryAddress state_addr,
                             MemoryAddress input_addr,
                             MemoryAddress output_addr) = 0;
};

class Sha256 : public Sha256Interface {
  public:
    Sha256(ExecutionIdGetterInterface& execution_id_manager,
           BitwiseInterface& bitwise,
           GreaterThanInterface& gt,
           EventEmitterInterface<Sha256CompressionEvent>& event_emitter)
        : execution_id_manager(execution_id_manager)
        , bitwise(bitwise)
        , gt(gt)
        , events(event_emitter)
    {}

    // Operands are expected to be direct.
    void compression(MemoryInterface& memory,
                     MemoryAddress state_addr,
                     MemoryAddress input_addr,
                     MemoryAddress output_addr) override;

  private:
    ExecutionIdGetterInterface& execution_id_manager;
    BitwiseInterface& bitwise;
    GreaterThanInterface& gt;
    EventEmitterInterface<Sha256CompressionEvent>& events;
};

} // namespace bb::avm2::simulation
