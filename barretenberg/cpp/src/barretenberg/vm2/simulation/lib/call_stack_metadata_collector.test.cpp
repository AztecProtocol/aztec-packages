#include "barretenberg/vm2/simulation/lib/call_stack_metadata_collector.hpp"

#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_context.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"

namespace bb::avm2::simulation {
namespace {

using ::testing::_;
using ::testing::ElementsAre;
using ::testing::Return;
using ::testing::ReturnRef;
using ::testing::StrictMock;

TEST(CallStackMetadataCollectorTest, SingleCallEnterAndExit)
{
    CallStackMetadataCollector collector;
    AztecAddress contract_addr(0x1234);
    uint32_t caller_pc = 100;
    uint32_t exit_pc = 200;
    Gas gas_limit{ 1000, 2000 };
    std::vector<FF> calldata = { FF(0xabcd), FF(0xef01) };
    std::vector<FF> return_data = { FF(0x5678), FF(0x9abc) };

    // Set phase
    collector.set_phase(CoarseTransactionPhase::APP_LOGIC);

    // Enter call
    CalldataProvider calldata_provider = [&calldata](uint32_t /*max_size*/) -> std::vector<FF> { return calldata; };

    collector.notify_enter_call(contract_addr, caller_pc, calldata_provider, false, gas_limit);

    // Exit call
    ReturnDataProvider return_data_provider = [&return_data](uint32_t /*max_size*/) -> std::vector<FF> {
        return return_data;
    };
    InternalCallStackProvider internal_call_stack_provider = []() -> std::vector<PC> {
        // This means that there where 2 internal calls, one at pc 0 and one at pc 10.
        // We are currently at PC exit_pc but the provider does not provide this.
        return { 0, 10 };
    };

    collector.notify_exit_call(true, exit_pc, std::nullopt, return_data_provider, internal_call_stack_provider);

    // Dump and verify
    auto metadata = collector.dump_call_stack_metadata();
    ASSERT_EQ(metadata.size(), 1U);

    const auto& call_metadata = metadata[0];
    EXPECT_EQ(call_metadata.timestamp, 0U);
    EXPECT_EQ(call_metadata.phase, CoarseTransactionPhase::APP_LOGIC);
    EXPECT_EQ(call_metadata.contract_address, contract_addr);
    EXPECT_EQ(call_metadata.caller_pc, caller_pc);
    EXPECT_EQ(call_metadata.internal_call_stack_at_exit, std::vector<PC>({ 0, 10, exit_pc }));
    EXPECT_EQ(call_metadata.calldata, calldata);
    EXPECT_EQ(call_metadata.output, return_data);
    EXPECT_EQ(call_metadata.is_static_call, false);
    EXPECT_EQ(call_metadata.gas_limit, gas_limit);
    EXPECT_EQ(call_metadata.reverted, false);
    EXPECT_EQ(call_metadata.halting_message, std::nullopt);
    EXPECT_EQ(call_metadata.num_nested_calls, 0U);
    EXPECT_TRUE(call_metadata.nested.empty());
}

TEST(CallStackMetadataCollectorTest, NestedCalls)
{
    CallStackMetadataCollector collector;
    AztecAddress contract1(0x1111);
    AztecAddress contract2(0x2222);
    AztecAddress contract3(0x3333);

    collector.set_phase(CoarseTransactionPhase::APP_LOGIC);

    // Enter first call
    std::vector<FF> calldata1 = { FF(0xaaaa) };
    CalldataProvider calldata_provider1 = [&calldata1](uint32_t /*max_size*/) -> std::vector<FF> { return calldata1; };

    collector.notify_enter_call(contract1, 100, calldata_provider1, false, Gas{ 1000, 2000 });

    // Enter second call (nested)
    std::vector<FF> calldata2 = { FF(0xbbbb) };
    CalldataProvider calldata_provider2 = [&calldata2](uint32_t /*max_size*/) -> std::vector<FF> { return calldata2; };

    collector.notify_enter_call(contract2, 200, calldata_provider2, false, Gas{ 500, 1000 });

    // Enter third call (nested in nested)
    std::vector<FF> calldata3 = { FF(0xcccc) };
    CalldataProvider calldata_provider3 = [&calldata3](uint32_t /*max_size*/) -> std::vector<FF> { return calldata3; };

    collector.notify_enter_call(contract3, 300, calldata_provider3, true, Gas{ 200, 400 });

    // Exit third call
    std::vector<FF> return_data3 = { FF(0x3333) };
    ReturnDataProvider return_data_provider3 = [&return_data3](uint32_t /*max_size*/) -> std::vector<FF> {
        return return_data3;
    };
    InternalCallStackProvider internal_call_stack_provider3 = []() -> std::vector<PC> { return { 300 }; };

    collector.notify_exit_call(true, 399, std::nullopt, return_data_provider3, internal_call_stack_provider3);

    // Exit second call
    std::vector<FF> return_data2 = { FF(0x2222) };
    ReturnDataProvider return_data_provider2 = [&return_data2](uint32_t /*max_size*/) -> std::vector<FF> {
        return return_data2;
    };
    InternalCallStackProvider internal_call_stack_provider2 = []() -> std::vector<PC> { return { 200 }; };

    collector.notify_exit_call(
        false, 299, "Nested call reverted", return_data_provider2, internal_call_stack_provider2);

    // Exit first call
    std::vector<FF> return_data1 = { FF(0x1111) };
    ReturnDataProvider return_data_provider1 = [&return_data1](uint32_t /*max_size*/) -> std::vector<FF> {
        return return_data1;
    };
    InternalCallStackProvider internal_call_stack_provider1 = []() -> std::vector<PC> { return { 100 }; };

    collector.notify_exit_call(true, 199, std::nullopt, return_data_provider1, internal_call_stack_provider1);

    // Dump and verify
    auto metadata = collector.dump_call_stack_metadata();
    ASSERT_EQ(metadata.size(), 1U);

    const auto& outer_call = metadata[0];
    EXPECT_EQ(outer_call.timestamp, 0U);
    EXPECT_EQ(outer_call.num_nested_calls, 1U);
    EXPECT_EQ(outer_call.nested.size(), 1U);
    EXPECT_EQ(outer_call.output, return_data1);
    EXPECT_EQ(outer_call.reverted, false);
    EXPECT_EQ(outer_call.halting_message, std::nullopt);
    EXPECT_EQ(outer_call.internal_call_stack_at_exit, std::vector<PC>({ 100, 199 }));

    const auto& middle_call = outer_call.nested[0];
    EXPECT_EQ(middle_call.timestamp, 1U);
    EXPECT_EQ(middle_call.num_nested_calls, 1U);
    EXPECT_EQ(middle_call.nested.size(), 1U);
    EXPECT_EQ(middle_call.output, return_data2);
    EXPECT_EQ(middle_call.reverted, true);
    EXPECT_EQ(middle_call.halting_message, "Nested call reverted");
    EXPECT_EQ(middle_call.internal_call_stack_at_exit, std::vector<PC>({ 200, 299 }));

    const auto& inner_call = middle_call.nested[0];
    EXPECT_EQ(inner_call.timestamp, 2U);
    EXPECT_EQ(inner_call.num_nested_calls, 0U);
    EXPECT_EQ(inner_call.nested.size(), 0U);
    EXPECT_EQ(inner_call.output, return_data3);
    EXPECT_EQ(inner_call.reverted, false);
    EXPECT_EQ(inner_call.halting_message, std::nullopt);
    EXPECT_EQ(inner_call.is_static_call, true);
    EXPECT_EQ(inner_call.internal_call_stack_at_exit, std::vector<PC>({ 300, 399 }));
}

TEST(CallStackMetadataCollectorTest, MultipleSiblingCalls)
{
    CallStackMetadataCollector collector;
    AztecAddress contract0(0x0000);
    AztecAddress contract1(0xaaaa);
    AztecAddress contract2(0xbbbb);

    collector.set_phase(CoarseTransactionPhase::APP_LOGIC);

    // Outer call.
    std::vector<FF> calldata0 = { FF(0x0000) };
    CalldataProvider calldata_provider0 = [&calldata0](uint32_t /*max_size*/) -> std::vector<FF> { return calldata0; };
    collector.notify_enter_call(contract0, 0, calldata_provider0, false, Gas{ 0, 0 });

    // First call
    std::vector<FF> calldata1 = { FF(0x1111) };
    CalldataProvider calldata_provider1 = [&calldata1](uint32_t /*max_size*/) -> std::vector<FF> { return calldata1; };

    collector.notify_enter_call(contract1, 100, calldata_provider1, false, Gas{ 1000, 2000 });

    ReturnDataProvider return_data_provider1 = [](uint32_t /*max_size*/) -> std::vector<FF> { return { FF(0xaaaa) }; };
    InternalCallStackProvider internal_call_stack_provider1 = []() -> std::vector<PC> { return { 100, 200 }; };

    collector.notify_exit_call(true, 150, std::nullopt, return_data_provider1, internal_call_stack_provider1);

    // Second call (sibling)
    std::vector<FF> calldata2 = { FF(0x2222) };
    CalldataProvider calldata_provider2 = [&calldata2](uint32_t /*max_size*/) -> std::vector<FF> { return calldata2; };

    collector.notify_enter_call(contract2, 200, calldata_provider2, false, Gas{ 500, 1000 });

    ReturnDataProvider return_data_provider2 = [](uint32_t /*max_size*/) -> std::vector<FF> { return { FF(0xbbbb) }; };
    InternalCallStackProvider internal_call_stack_provider2 = []() -> std::vector<PC> { return { 200, 300 }; };

    collector.notify_exit_call(true, 250, std::nullopt, return_data_provider2, internal_call_stack_provider2);

    // Outer call (return).
    ReturnDataProvider return_data_provider0 = [](uint32_t /*max_size*/) -> std::vector<FF> { return { FF(0x0000) }; };
    InternalCallStackProvider internal_call_stack_provider0 = []() -> std::vector<PC> { return { 0, 100 }; };
    collector.notify_exit_call(true, 0, std::nullopt, return_data_provider0, internal_call_stack_provider0);

    // Verify both calls are present
    auto metadata = collector.dump_call_stack_metadata();
    ASSERT_EQ(metadata.size(), 1U);

    const auto& outer_call = metadata[0];
    EXPECT_EQ(outer_call.timestamp, 0U);
    EXPECT_EQ(outer_call.num_nested_calls, 2U);
    EXPECT_EQ(outer_call.halting_message, std::nullopt);
    ASSERT_EQ(outer_call.nested.size(), 2U);
    EXPECT_EQ(outer_call.nested[0].timestamp, 1U);
    EXPECT_EQ(outer_call.nested[0].halting_message, std::nullopt);
    EXPECT_EQ(outer_call.nested[1].timestamp, 2U);
    EXPECT_EQ(outer_call.nested[1].halting_message, std::nullopt);
    EXPECT_EQ(outer_call.nested[0].contract_address, contract1);
    EXPECT_EQ(outer_call.nested[1].contract_address, contract2);
}

TEST(CallStackMetadataCollectorTest, CalldataSizeLimit)
{
    CallStackMetadataCollector collector;
    AztecAddress contract_addr(0x1234);
    std::vector<FF> large_calldata(2000, FF(0xabcd)); // Larger than max_calldata_size (1024)

    collector.set_phase(CoarseTransactionPhase::APP_LOGIC);

    CalldataProvider calldata_provider = [&large_calldata](uint32_t max_size) -> std::vector<FF> {
        // Provider should respect max_size
        if (large_calldata.size() > max_size) {
            return std::vector<FF>(large_calldata.begin(), large_calldata.begin() + max_size);
        }
        return large_calldata;
    };

    collector.notify_enter_call(contract_addr, 100, calldata_provider, false, Gas{ 1000, 2000 });

    ReturnDataProvider return_data_provider = [](uint32_t /*max_size*/) -> std::vector<FF> { return {}; };
    InternalCallStackProvider internal_call_stack_provider = []() -> std::vector<PC> { return { 100, 200 }; };

    collector.notify_exit_call(true, 200, std::nullopt, return_data_provider, internal_call_stack_provider);

    auto metadata = collector.dump_call_stack_metadata();
    ASSERT_EQ(metadata.size(), 1U);
    // Calldata should be limited to max_calldata_size (1024)
    EXPECT_EQ(metadata[0].calldata.size(), 1024U);
    EXPECT_EQ(metadata[0].halting_message, std::nullopt);
}

TEST(CallStackMetadataCollectorTest, ReturnDataSizeLimit)
{
    CallStackMetadataCollector collector;
    AztecAddress contract_addr(0x5678);
    std::vector<FF> calldata = { FF(0x1234) };

    collector.set_phase(CoarseTransactionPhase::APP_LOGIC);

    CalldataProvider calldata_provider = [&calldata](uint32_t /*max_size*/) -> std::vector<FF> { return calldata; };

    collector.notify_enter_call(contract_addr, 100, calldata_provider, false, Gas{ 1000, 2000 });

    std::vector<FF> large_return_data(2000, FF(0xef01)); // Larger than max_return_data_size (1024)
    ReturnDataProvider return_data_provider = [&large_return_data](uint32_t max_size) -> std::vector<FF> {
        // Provider should respect max_size
        if (large_return_data.size() > max_size) {
            return std::vector<FF>(large_return_data.begin(), large_return_data.begin() + max_size);
        }
        return large_return_data;
    };
    InternalCallStackProvider internal_call_stack_provider = []() -> std::vector<PC> { return { 100, 200 }; };

    collector.notify_exit_call(true, 200, std::nullopt, return_data_provider, internal_call_stack_provider);

    auto metadata = collector.dump_call_stack_metadata();
    ASSERT_EQ(metadata.size(), 1U);
    // Return data should be limited to max_return_data_size (1024)
    EXPECT_EQ(metadata[0].output.size(), 1024U);
    EXPECT_EQ(metadata[0].halting_message, std::nullopt);
}

TEST(CallStackMetadataCollectorTest, PhaseTracking)
{
    CallStackMetadataCollector collector;
    AztecAddress contract1(0x1111);
    AztecAddress contract2(0x2222);
    AztecAddress contract3(0x3333);

    // First call in SETUP phase
    collector.set_phase(CoarseTransactionPhase::SETUP);
    std::vector<FF> calldata1 = { FF(0xaaaa) };
    CalldataProvider calldata_provider1 = [&calldata1](uint32_t /*max_size*/) -> std::vector<FF> { return calldata1; };

    collector.notify_enter_call(contract1, 100, calldata_provider1, false, Gas{ 1000, 2000 });
    collector.notify_exit_call(
        true,
        150,
        std::nullopt,
        [](uint32_t) -> std::vector<FF> { return {}; },
        []() -> std::vector<PC> { return { 100, 200 }; });

    // Second call in APP_LOGIC phase
    collector.set_phase(CoarseTransactionPhase::APP_LOGIC);
    std::vector<FF> calldata2 = { FF(0xbbbb) };
    CalldataProvider calldata_provider2 = [&calldata2](uint32_t /*max_size*/) -> std::vector<FF> { return calldata2; };

    collector.notify_enter_call(contract2, 200, calldata_provider2, false, Gas{ 500, 1000 });
    collector.notify_exit_call(
        true,
        250,
        std::nullopt,
        [](uint32_t) -> std::vector<FF> { return {}; },
        []() -> std::vector<PC> { return { 200, 300 }; });

    // Third call in TEARDOWN phase
    collector.set_phase(CoarseTransactionPhase::TEARDOWN);
    std::vector<FF> calldata3 = { FF(0xcccc) };
    CalldataProvider calldata_provider3 = [&calldata3](uint32_t /*max_size*/) -> std::vector<FF> { return calldata3; };

    collector.notify_enter_call(contract3, 300, calldata_provider3, false, Gas{ 200, 400 });
    collector.notify_exit_call(
        true,
        350,
        std::nullopt,
        [](uint32_t) -> std::vector<FF> { return {}; },
        []() -> std::vector<PC> { return { 300, 400 }; });

    auto metadata = collector.dump_call_stack_metadata();
    ASSERT_EQ(metadata.size(), 3U);

    EXPECT_EQ(metadata[0].phase, CoarseTransactionPhase::SETUP);
    EXPECT_EQ(metadata[0].halting_message, std::nullopt);
    EXPECT_EQ(metadata[1].phase, CoarseTransactionPhase::APP_LOGIC);
    EXPECT_EQ(metadata[1].halting_message, std::nullopt);
    EXPECT_EQ(metadata[2].phase, CoarseTransactionPhase::TEARDOWN);
    EXPECT_EQ(metadata[2].halting_message, std::nullopt);
}

// Test helper functions
class MakeProviderTest : public ::testing::Test {
  protected:
    StrictMock<MockContext> mock_context;
};

TEST_F(MakeProviderTest, MakeCalldataProviderSuccess)
{
    uint32_t cd_offset = 100;
    uint32_t cd_size = 5;
    std::vector<MemoryValue> calldata_values = {
        MemoryValue::from<FF>(FF(0xaaaa)), MemoryValue::from<FF>(FF(0xbbbb)), MemoryValue::from<FF>(FF(0xcccc)),
        MemoryValue::from<FF>(FF(0xdddd)), MemoryValue::from<FF>(FF(0xeeee)),
    };

    // These are called when creating the provider
    EXPECT_CALL(mock_context, get_parent_cd_addr()).WillOnce(Return(cd_offset));
    EXPECT_CALL(mock_context, get_parent_cd_size()).WillOnce(Return(cd_size));

    auto provider = make_calldata_provider(mock_context);

    // This is called when invoking the provider
    EXPECT_CALL(mock_context, get_calldata(cd_offset, cd_size)).WillOnce(Return(calldata_values));

    auto result = provider(1024);

    EXPECT_THAT(result, ElementsAre(FF(0xaaaa), FF(0xbbbb), FF(0xcccc), FF(0xdddd), FF(0xeeee)));
}

TEST_F(MakeProviderTest, MakeCalldataProviderRespectsMaxSize)
{
    uint32_t cd_offset = 0;
    uint32_t cd_size = 2000; // Larger than max_size
    uint32_t max_size = 10;
    std::vector<MemoryValue> calldata_values(2000);
    for (size_t i = 0; i < 2000; ++i) {
        calldata_values[i] = MemoryValue::from<FF>(FF(i));
    }

    // These are called when creating the provider
    EXPECT_CALL(mock_context, get_parent_cd_addr()).WillOnce(Return(cd_offset));
    EXPECT_CALL(mock_context, get_parent_cd_size()).WillOnce(Return(cd_size));

    auto provider = make_calldata_provider(mock_context);

    // This is called when invoking the provider
    EXPECT_CALL(mock_context, get_calldata(cd_offset, max_size))
        .WillOnce([&calldata_values, max_size](uint32_t, uint32_t) {
            return std::vector<MemoryValue>(calldata_values.begin(), calldata_values.begin() + max_size);
        });

    auto result = provider(max_size);

    ASSERT_EQ(result.size(), max_size);
}

TEST_F(MakeProviderTest, MakeCalldataProviderHandlesException)
{
    static AztecAddress contract_addr(0x1234);
    uint32_t cd_offset = 100;
    uint32_t cd_size = 5;

    // These are called when creating the provider
    EXPECT_CALL(mock_context, get_parent_cd_addr()).WillOnce(Return(cd_offset));
    EXPECT_CALL(mock_context, get_parent_cd_size()).WillOnce(Return(cd_size));

    auto provider = make_calldata_provider(mock_context);

    // This is called when invoking the provider, and throws
    EXPECT_CALL(mock_context, get_calldata(cd_offset, _))
        .WillOnce(::testing::Throw(std::runtime_error("Test exception")));
    // The exception handler may call get_address() and get_pc() for logging (optional)
    EXPECT_CALL(mock_context, get_address()).Times(::testing::AnyNumber()).WillRepeatedly(ReturnRef(contract_addr));
    EXPECT_CALL(mock_context, get_pc()).Times(::testing::AnyNumber()).WillRepeatedly(Return(200));

    auto result = provider(1024);

    // Should return empty vector on exception
    EXPECT_TRUE(result.empty());
}

TEST_F(MakeProviderTest, MakeReturnDataProviderSuccess)
{
    uint32_t rd_addr = 200;
    uint32_t rd_size = 3;
    std::vector<MemoryValue> return_data_values = {
        MemoryValue::from<FF>(FF(0x1111)),
        MemoryValue::from<FF>(FF(0x2222)),
        MemoryValue::from<FF>(FF(0x3333)),
    };

    auto provider = make_return_data_provider(mock_context, rd_addr, rd_size);

    // This is called when invoking the provider
    StrictMock<MockMemory> memory;
    EXPECT_CALL(::testing::Const(mock_context), get_memory()).WillOnce(ReturnRef(memory));
    ON_CALL(memory, get).WillByDefault([&return_data_values](uint32_t i) -> const MemoryValue& {
        return return_data_values[i];
    });
    EXPECT_CALL(memory, get).Times(static_cast<int>(rd_size));

    auto result = provider(1024);

    EXPECT_THAT(result, ElementsAre(FF(0x1111), FF(0x2222), FF(0x3333)));
}

TEST_F(MakeProviderTest, MakeReturnDataProviderRespectsMaxSize)
{
    uint32_t rd_addr = 0;
    uint32_t rd_size = 2000; // Larger than max_size
    uint32_t max_size = 15;
    std::vector<MemoryValue> return_data_values(2000);
    for (size_t i = 0; i < 2000; ++i) {
        return_data_values[i] = MemoryValue::from<FF>(FF(i * 2));
    }

    auto provider = make_return_data_provider(mock_context, rd_addr, rd_size);

    // This is called when invoking the provider
    StrictMock<MockMemory> memory;
    EXPECT_CALL(::testing::Const(mock_context), get_memory()).WillOnce(ReturnRef(memory));
    ON_CALL(memory, get).WillByDefault([&return_data_values](uint32_t i) -> const MemoryValue& {
        return return_data_values[i];
    });
    EXPECT_CALL(memory, get).Times(static_cast<int>(max_size));

    auto result = provider(max_size);

    ASSERT_EQ(result.size(), max_size);
}

TEST_F(MakeProviderTest, MakeReturnDataProviderHandlesException)
{
    uint32_t rd_addr = 200;
    uint32_t rd_size = 3;
    static AztecAddress contract_addr(0x5678);

    auto provider = make_return_data_provider(mock_context, rd_addr, rd_size);

    // This is called when invoking the provider, and throws
    StrictMock<MockMemory> memory;
    EXPECT_CALL(::testing::Const(mock_context), get_memory())
        .WillOnce(::testing::Throw(std::runtime_error("Test exception")));

    // The exception handler may call get_address() and get_pc() for logging (optional)
    EXPECT_CALL(mock_context, get_address()).Times(::testing::AnyNumber()).WillRepeatedly(ReturnRef(contract_addr));
    EXPECT_CALL(mock_context, get_pc()).Times(::testing::AnyNumber()).WillRepeatedly(Return(300));

    auto result = provider(1024);

    // Should return empty vector on exception
    EXPECT_TRUE(result.empty());
}

} // namespace
} // namespace bb::avm2::simulation
