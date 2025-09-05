#pragma once

#include <array>
#include <cassert>
#include <cstdint>
#include <span>

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/events/addressing_event.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/gt.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"
#include "barretenberg/vm2/simulation/memory.hpp"

namespace bb::avm2::simulation {

class AddressingInterface {
  public:
    virtual ~AddressingInterface() = default;
    // @throws AddressingException.
    virtual std::vector<Operand> resolve(const Instruction& instruction, MemoryInterface& memory) = 0;
};

class Addressing final : public AddressingInterface {
  public:
    Addressing(const InstructionInfoDBInterface& instruction_info_db,
               GreaterThanInterface& gt,
               EventEmitterInterface<AddressingEvent>& event_emitter)
        : instruction_info_db(instruction_info_db)
        , gt(gt)
        , events(event_emitter)
    {}

    std::vector<Operand> resolve(const Instruction& instruction, MemoryInterface& memory) override;

  private:
    const InstructionInfoDBInterface& instruction_info_db;
    GreaterThanInterface& gt;
    EventEmitterInterface<AddressingEvent>& events;

    bool is_address_out_of_range(const FF& address);
};

} // namespace bb::avm2::simulation
