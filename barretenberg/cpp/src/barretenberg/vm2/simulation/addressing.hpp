#pragma once

#include <array>
#include <cassert>
#include <cstdint>
#include <span>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class AddressingInterface {
  public:
    virtual ~AddressingInterface() = default;
    // @throws AddressingException.
    virtual std::vector<Operand> resolve(const Instruction& instruction, MemoryInterface& memory) const = 0;
};

class Addressing final : public AddressingInterface {
  public:
    Addressing(const InstructionInfoDBInterface& instruction_info_db,
               EventEmitterInterface<AddressingEvent>& event_emitter)
        : instruction_info_db(instruction_info_db)
        , events(event_emitter)
    {}

    std::vector<Operand> resolve(const Instruction& instruction, MemoryInterface& memory) const override;

  private:
    const InstructionInfoDBInterface& instruction_info_db;
    EventEmitterInterface<AddressingEvent>& events;
};

} // namespace bb::avm2::simulation