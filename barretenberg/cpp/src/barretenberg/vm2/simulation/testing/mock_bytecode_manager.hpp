#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/bytecode_manager.hpp"

namespace bb::avm2::simulation {

class MockBytecodeManager : public BytecodeManagerInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockBytecodeManager();
    ~MockBytecodeManager() override;

    MOCK_METHOD(Instruction, read_instruction, (uint32_t pc), (const, override));
    MOCK_METHOD(ContractClassId, get_class_id, (), (const, override));
};

} // namespace bb::avm2::simulation