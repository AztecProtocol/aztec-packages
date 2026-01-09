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
                (const AztecAddress& address,
                 const AztecAddress& msg_sender,
                 const FF& transaction_fee,
                 ContextInterface& parent_context,
                 MemoryAddress cd_offset_address,
                 uint32_t cd_size,
                 bool is_static,
                 const Gas& gas_limit,
                 TransactionPhase phase),
                (override));

    MOCK_METHOD(std::unique_ptr<ContextInterface>,
                make_enqueued_context,
                (const AztecAddress& address,
                 const AztecAddress& msg_sender,
                 const FF& transaction_fee,
                 std::span<const FF> calldata,
                 const FF& calldata_hash,
                 bool is_static,
                 const Gas& gas_limit,
                 const Gas& gas_used,
                 TransactionPhase phase),
                (override));

    MOCK_METHOD(uint32_t, get_next_context_id, (), (const, override));
};

} // namespace bb::avm2::simulation
