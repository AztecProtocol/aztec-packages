#pragma once

#include "barretenberg/vm2/common/memory_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/addressing.hpp"
#include "barretenberg/vm2/simulation/lib/instruction_info.hpp"
#include "barretenberg/vm2/simulation/lib/serialization.hpp"

namespace bb::avm2::simulation {

class PureAddressing final : public AddressingInterface {
  public:
    PureAddressing(const InstructionInfoDBInterface& instruction_info_db)
        : instruction_info_db(instruction_info_db)
    {}

    std::vector<Operand> resolve(const Instruction& instruction, MemoryInterface& memory) override;

  private:
    const InstructionInfoDBInterface& instruction_info_db;
};

} // namespace bb::avm2::simulation
