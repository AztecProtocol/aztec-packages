#include "barretenberg/vm2/simulation/standalone/debug_log.hpp"

#include <cstdint>
#include <gmock/gmock.h>
#include <gtest/gtest.h>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/to_radix_event.hpp"
#include "barretenberg/vm2/simulation/gadgets/memory.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_gt.hpp"
#include "barretenberg/vm2/simulation/standalone/pure_memory.hpp"
#include "barretenberg/vm2/simulation/testing/mock_execution_id_manager.hpp"
#include "barretenberg/vm2/simulation/testing/mock_gt.hpp"
#include "barretenberg/vm2/simulation/testing/mock_memory.hpp"
#include "barretenberg/vm2/testing/macros.hpp"

using ::testing::ElementsAre;
using ::testing::ReturnRef;
using ::testing::SizeIs;
using ::testing::StrictMock;

namespace bb::avm2::simulation {

namespace {

TEST(DebugLogSimulationTest, Basic)
{
    StrictMock<MockMemory> memory;
    std::vector<std::string> log_messages;
    DebugLogger debug_logger(
        DebugLogLevel::INFO, 9, [&log_messages](const std::string& message) { log_messages.push_back(message); });

    AztecAddress contract_address = 42;
    MemoryAddress level_offset = 50;
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;

    std::array<MemoryValue, 5> message_data = {
        MemoryValue::from<FF>('H'), // 'H'
        MemoryValue::from<FF>('e'), // 'e'
        MemoryValue::from<FF>('l'), // 'l'
        MemoryValue::from<FF>('l'), // 'l'
        MemoryValue::from<FF>('o'), // 'o'
    };
    uint16_t message_size = message_data.size();

    std::array<MemoryValue, 2> fields_data = { MemoryValue::from<FF>(42), MemoryValue::from<FF>(123) };
    uint32_t fields_size = fields_data.size();

    MemoryValue level = MemoryValue::from<uint8_t>(static_cast<uint8_t>(DebugLogLevel::FATAL));

    MemoryValue fields_size_value = MemoryValue::from<uint32_t>(fields_size);

    EXPECT_CALL(memory, get(level_offset)).WillOnce(ReturnRef(level));
    EXPECT_CALL(memory, get(fields_size_offset)).WillOnce(ReturnRef(fields_size_value));
    for (uint32_t i = 0; i < message_size; ++i) {
        EXPECT_CALL(memory, get(message_offset + i)).WillOnce(ReturnRef(message_data[i]));
    }

    for (uint32_t i = 0; i < fields_size; ++i) {
        EXPECT_CALL(memory, get(fields_offset + i)).WillOnce(ReturnRef(fields_data[i]));
    }

    debug_logger.debug_log(
        memory, contract_address, level_offset, message_offset, message_size, fields_offset, fields_size_offset);

    EXPECT_THAT(log_messages, ElementsAre("DEBUGLOG(fatal): Hello: [0x2a, 0x7b]"));
    EXPECT_THAT(debug_logger.dump_logs(), ElementsAre(DebugLog{ contract_address, "fatal", "Hello", { 42, 123 } }));
}

TEST(DebugLogSimulationTest, MaxMemoryReadsExceeded)
{
    StrictMock<MockMemory> memory;
    std::vector<std::string> log_messages;
    DebugLogger debug_logger(
        DebugLogLevel::INFO, 8, [&log_messages](const std::string& message) { log_messages.push_back(message); });

    AztecAddress contract_address = 42;
    MemoryAddress level_offset = 50;
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;
    uint16_t message_size = 5;
    uint32_t fields_size = 2;

    MemoryValue level = MemoryValue::from<uint8_t>(static_cast<uint8_t>(DebugLogLevel::FATAL));

    MemoryValue fields_size_value = MemoryValue::from<uint32_t>(fields_size);

    EXPECT_CALL(memory, get(level_offset)).WillOnce(ReturnRef(level));
    EXPECT_CALL(memory, get(fields_size_offset)).WillOnce(ReturnRef(fields_size_value));

    EXPECT_THROW(
        debug_logger.debug_log(
            memory, contract_address, level_offset, message_offset, message_size, fields_offset, fields_size_offset),
        std::runtime_error);

    EXPECT_THAT(log_messages, SizeIs(0));
    EXPECT_THAT(debug_logger.dump_logs(), SizeIs(0));
}

TEST(DebugLogSimulationTest, InvalidLevel)
{
    StrictMock<MockMemory> memory;
    std::vector<std::string> log_messages;
    DebugLogger debug_logger(
        DebugLogLevel::INFO, 9, [&log_messages](const std::string& message) { log_messages.push_back(message); });

    AztecAddress contract_address = 42;
    MemoryAddress level_offset = 50;
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;

    std::array<MemoryValue, 5> message_data = {
        MemoryValue::from<FF>('H'), // 'H'
        MemoryValue::from<FF>('e'), // 'e'
        MemoryValue::from<FF>('l'), // 'l'
        MemoryValue::from<FF>('l'), // 'l'
        MemoryValue::from<FF>('o'), // 'o'
    };
    uint16_t message_size = message_data.size();

    std::array<MemoryValue, 2> fields_data = { MemoryValue::from<FF>(42), MemoryValue::from<FF>(123) };
    uint32_t fields_size = fields_data.size();

    MemoryValue level = MemoryValue::from<uint8_t>(static_cast<uint8_t>(42));

    MemoryValue fields_size_value = MemoryValue::from<uint32_t>(fields_size);

    EXPECT_CALL(memory, get(level_offset)).WillOnce(ReturnRef(level));
    EXPECT_CALL(memory, get(fields_size_offset)).WillOnce(ReturnRef(fields_size_value));
    for (uint32_t i = 0; i < message_size; ++i) {
        EXPECT_CALL(memory, get(message_offset + i)).WillOnce(ReturnRef(message_data[i]));
    }

    for (uint32_t i = 0; i < fields_size; ++i) {
        EXPECT_CALL(memory, get(fields_offset + i)).WillOnce(ReturnRef(fields_data[i]));
    }

    EXPECT_THROW(
        debug_logger.debug_log(
            memory, contract_address, level_offset, message_offset, message_size, fields_offset, fields_size_offset),
        std::runtime_error);

    EXPECT_THAT(log_messages, SizeIs(0));
    EXPECT_THAT(debug_logger.dump_logs(), SizeIs(0));
}

TEST(DebugLogSimulationTest, LogLevel)
{
    StrictMock<MockMemory> memory;
    std::vector<std::string> log_messages;
    DebugLogger debug_logger(
        DebugLogLevel::INFO, 9, [&log_messages](const std::string& message) { log_messages.push_back(message); });

    AztecAddress contract_address = 42;
    MemoryAddress level_offset = 50;
    MemoryAddress message_offset = 100;
    MemoryAddress fields_offset = 200;
    MemoryAddress fields_size_offset = 300;

    std::array<MemoryValue, 1> message_data = {
        MemoryValue::from<FF>('A'), // 'A'
    };
    uint16_t message_size = message_data.size();

    std::array<MemoryValue, 1> fields_data = { MemoryValue::from<FF>(42) };
    uint32_t fields_size = fields_data.size();

    MemoryValue level = MemoryValue::from<uint8_t>(static_cast<uint8_t>(DebugLogLevel::VERBOSE));

    MemoryValue fields_size_value = MemoryValue::from<uint32_t>(fields_size);

    EXPECT_CALL(memory, get(level_offset)).WillOnce(ReturnRef(level));
    EXPECT_CALL(memory, get(fields_size_offset)).WillOnce(ReturnRef(fields_size_value));
    for (uint32_t i = 0; i < message_size; ++i) {
        EXPECT_CALL(memory, get(message_offset + i)).WillOnce(ReturnRef(message_data[i]));
    }

    for (uint32_t i = 0; i < fields_size; ++i) {
        EXPECT_CALL(memory, get(fields_offset + i)).WillOnce(ReturnRef(fields_data[i]));
    }

    debug_logger.debug_log(
        memory, contract_address, level_offset, message_offset, message_size, fields_offset, fields_size_offset);

    // Not logged to stdout
    EXPECT_THAT(log_messages, SizeIs(0));
    // But recorded in the debug logs vector
    EXPECT_THAT(debug_logger.dump_logs(), ElementsAre(DebugLog{ contract_address, "verbose", "A", { 42 } }));
}

} // namespace

} // namespace bb::avm2::simulation
