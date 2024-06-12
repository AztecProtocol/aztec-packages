#include "stream_parser.hpp"
#include "barretenberg/common/test.hpp"
#include "barretenberg/messaging/header.hpp"
#include "gtest/gtest.h"
#include <array>
#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <vector>

using namespace bb::messaging;

std::vector<char> createMessage(uint16_t type, uint32_t messageId, uint32_t requestId, uint32_t dataSize)
{
    MsgHeader header(type, requestId, messageId, HEADER_SIZE + dataSize);
    std::vector<char> message(header.msgLength);
    std::memcpy(&message[0], &header, HEADER_SIZE);
    return message;
}

void assertHandledMessage(std::vector<char>& inputMessage, const MsgHeader* parsedHeader, const char* parsedData)
{
    EXPECT_EQ(0, std::memcmp(&inputMessage[0], parsedHeader, HEADER_SIZE));
    EXPECT_EQ(0, std::memcmp(&inputMessage[HEADER_SIZE], parsedData, inputMessage.size() - HEADER_SIZE));
}

TEST(messaging_stream_parser, correctly_parses_basic_message)
{
    const MsgHeader* parsedHeader = nullptr;
    const char* receivedData = nullptr;
    int numCalls = 0;

    std::function<bool(const MsgHeader*, const char*)> handler = [&](const MsgHeader* header, const char* data) {
        parsedHeader = header;
        receivedData = data;
        numCalls++;
        return true;
    };
    StreamParser parser(handler);
    std::vector<char> message = createMessage(5, 57, 56, 14);
    parser.onNewData(&message[0], static_cast<uint32_t>(message.size()));
    EXPECT_EQ(numCalls, 1);
    assertHandledMessage(message, parsedHeader, receivedData);
}

TEST(messaging_stream_parser, correctly_parses_split_message)
{
    const uint32_t dataSize = 14;
    const MsgHeader* parsedHeader = nullptr;
    const char* receivedData = nullptr;
    int numCalls = 0;

    std::function<bool(const MsgHeader*, const char*)> handler = [&](const MsgHeader* header, const char* data) {
        parsedHeader = header;
        receivedData = data;
        numCalls++;
        return true;
    };
    StreamParser parser(handler);
    std::vector<char> message = createMessage(5, 57, 56, dataSize);

    size_t readPointer = 0;
    // add less than the magic string
    parser.onNewData(&message[readPointer], static_cast<uint32_t>(MAGIC_STRING_LENGTH - 1));
    readPointer += MAGIC_STRING_LENGTH - 1;

    // handler not yet called
    EXPECT_EQ(numCalls, 0);

    // now add more than magic string, less than header
    parser.onNewData(&message[readPointer], 2);
    readPointer += 2;

    // should still not have been called
    EXPECT_EQ(numCalls, 0);

    // now add up to the header
    parser.onNewData(&message[readPointer], static_cast<uint32_t>(HEADER_SIZE - readPointer));
    readPointer = HEADER_SIZE;

    // should still not have been called
    EXPECT_EQ(numCalls, 0);

    // now add part of the data
    parser.onNewData(&message[readPointer], static_cast<uint32_t>(dataSize / 2));
    readPointer += dataSize / 2;

    // should still not have been called
    EXPECT_EQ(numCalls, 0);

    // now add the rest of the data
    parser.onNewData(&message[readPointer], static_cast<uint32_t>(dataSize / 2));
    readPointer += dataSize / 2;

    // should still not have been called
    EXPECT_EQ(numCalls, 1);

    assertHandledMessage(message, parsedHeader, receivedData);
}

TEST(messaging_stream_parser, correctly_parses_multiple_messages)
{
    std::array<std::vector<char>, 3> messages = { createMessage(5, 57, 56, 14),
                                                  createMessage(6, 58, 57, 18),
                                                  createMessage(7, 59, 58, 20) };
    std::vector<char> fullStream;
    for (const auto& message : messages) {
        fullStream.insert(fullStream.end(), message.begin(), message.end());
    }
    uint32_t numCalls = 0;
    std::function<bool(const MsgHeader*, const char*)> handler = [&](const MsgHeader* header, const char* data) {
        assertHandledMessage(messages[numCalls], header, data);
        numCalls++;
        return true;
    };
    StreamParser parser(handler);
    parser.onNewData(&fullStream[0], static_cast<uint32_t>(fullStream.size()));
    EXPECT_EQ(numCalls, 3);
}

TEST(messaging_stream_parser, correctly_parses_split_multiple_messages)
{
    std::array<std::vector<char>, 3> messages = { createMessage(5, 57, 56, 14),
                                                  createMessage(6, 58, 57, 14),
                                                  createMessage(7, 59, 58, 14) };
    std::vector<char> fullStream;
    for (const auto& message : messages) {
        fullStream.insert(fullStream.end(), message.begin(), message.end());
    }
    uint32_t numCalls = 0;
    std::function<bool(const MsgHeader*, const char*)> handler = [&](const MsgHeader* header, const char* data) {
        assertHandledMessage(messages[numCalls], header, data);
        numCalls++;
        return true;
    };
    StreamParser parser(handler);

    // add the data in chunks
    std::array<uint32_t, 3> chunks = { static_cast<uint32_t>(fullStream.size() / 6),
                                       static_cast<uint32_t>((fullStream.size() / 6) * 2),
                                       static_cast<uint32_t>((fullStream.size() / 6) * 2) };
    uint32_t readPointer = 0;
    for (size_t i = 0; i < chunks.size(); i++) {
        parser.onNewData(&fullStream[readPointer], chunks[i]);
        readPointer += chunks[i];
    }
    uint32_t remaining = static_cast<uint32_t>(fullStream.size()) - readPointer;
    parser.onNewData(&fullStream[readPointer], remaining);
    EXPECT_EQ(numCalls, 3);
}

TEST(messaging_stream_parser, correctly_parses_split_multiple_messages_with_garbage)
{
    std::array<std::vector<char>, 3> messages = { createMessage(5, 57, 56, 14),
                                                  createMessage(6, 58, 57, 14),
                                                  createMessage(7, 59, 58, 14) };
    std::vector<char> fullStream;
    // build the full stream with garbage bytes inserted before each real message
    for (const auto& message : messages) {
        std::string garbage{ "epfnwpcndcqwedoceodinc" };
        fullStream.insert(fullStream.end(), garbage.begin(), garbage.end());
        fullStream.insert(fullStream.end(), message.begin(), message.end());
    }
    uint32_t numCalls = 0;
    std::function<bool(const MsgHeader*, const char*)> handler = [&](const MsgHeader* header, const char* data) {
        assertHandledMessage(messages[numCalls], header, data);
        numCalls++;
        return true;
    };
    StreamParser parser(handler);

    // add the data in chunks
    std::array<uint32_t, 3> chunks = { static_cast<uint32_t>(fullStream.size() / 6),
                                       static_cast<uint32_t>((fullStream.size() / 6) * 2),
                                       static_cast<uint32_t>((fullStream.size() / 6) * 2) };
    uint32_t readPointer = 0;
    for (size_t i = 0; i < chunks.size(); i++) {
        parser.onNewData(&fullStream[readPointer], chunks[i]);
        readPointer += chunks[i];
    }
    uint32_t remaining = static_cast<uint32_t>(fullStream.size()) - readPointer;
    parser.onNewData(&fullStream[readPointer], remaining);
    EXPECT_EQ(numCalls, 3);
}