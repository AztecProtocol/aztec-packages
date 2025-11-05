#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <optional>

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/bytecode_manager.hpp"

namespace bb::avm2::simulation {

class MockBytecodeManager : public BytecodeManagerInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockBytecodeManager();
    ~MockBytecodeManager() override;

    MOCK_METHOD(Instruction, read_instruction, (uint32_t pc), (override));
    MOCK_METHOD(BytecodeId, get_bytecode_id, (), (override));
    MOCK_METHOD(std::optional<BytecodeId>, get_retrieved_bytecode_id, (), (override));
};

} // namespace bb::avm2::simulation
