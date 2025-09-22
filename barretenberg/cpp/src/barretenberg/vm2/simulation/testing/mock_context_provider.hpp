#pragma once

#include <cstdint>
#include <memory>

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/interfaces/context_provider.hpp"
#include "barretenberg/vm2/simulation/interfaces/memory.hpp"

namespace bb::avm2::simulation {

class MockContextProvider : public ContextProviderInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockContextProvider();
    ~MockContextProvider() override;

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_nested_context,
                (AztecAddress address,
                 AztecAddress msg_sender,
                 FF transaction_fee,
                 ContextInterface& parent_context,
                 MemoryAddress cd_offset_addr,
                 MemoryAddress cd_size_addr,
                 bool is_static,
                 Gas gas_limit,
                 SideEffectStates side_effect_states,
                 TransactionPhase phase),
                (override));

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_enqueued_context,
                (AztecAddress address,
                 AztecAddress msg_sender,
                 FF transaction_fee,
                 std::span<const FF> calldata,
                 bool is_static,
                 Gas gas_limit,
                 Gas gas_used,
                 SideEffectStates side_effect_states,
                 TransactionPhase phase),
                (override));

    MOCK_METHOD(uint32_t, get_next_context_id, (), (const, override));
};

} // namespace bb::avm2::simulation
