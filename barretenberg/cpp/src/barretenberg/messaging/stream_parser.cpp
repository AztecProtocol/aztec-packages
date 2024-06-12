#include "stream_parser.hpp"
#include "barretenberg/messaging/header.hpp"
#include <cstdint>
#include <cstring>

namespace bb::messaging {
bool StreamParser::onNewData(char* data, uint32_t length)
{
    uint32_t newSize = bufferLength + length;
    if (newSize > buffer.size()) {
        buffer.resize(buffer.size() + length);
    }
    std::memcpy(&buffer[bufferLength], data, length);
    bufferLength += length;

    while (true) {
        uint32_t dataRemaining = bufferLength - readPointer;
        if (dataRemaining < MAGIC_STRING_LENGTH) {
            // not even enough to query the magic string
            shrinkBuffer();
            break;
        }
        if (std::memcmp(&buffer[readPointer], MAGIC_STRING, MAGIC_STRING_LENGTH) != 0) {
            ++readPointer;
            continue;
        }
        // We have found the magic string, now see if there is a full header
        if (dataRemaining < HEADER_SIZE) {
            // Less than header bytes available, wait for more data
            shrinkBuffer();
            break;
        }
        // We have a full header at least
        const char* messageStart = &buffer[readPointer];
        const MsgHeader* header = reinterpret_cast<const MsgHeader*>(messageStart);
        // Now see if we have a full message
        if (header->msgLength > dataRemaining) {
            // We don't, wait for more data
            shrinkBuffer();
            break;
        }

        // We have a full message!
        readPointer += header->msgLength;
        bool continueStream = messageHandler(header, messageStart + HEADER_SIZE);
        // If we are told the stream has ended, propagate that information up
        if (!continueStream) {
            return false;
        }
    }
    return true;
}

void StreamParser::shrinkBuffer()
{
    uint32_t dataRemaining = bufferLength - readPointer;
    if (dataRemaining > 0 && readPointer > 0) {
        // use memove as ranges could overlap
        std::memmove(&buffer[0], &buffer[readPointer], dataRemaining);
    }
    readPointer = 0;
    bufferLength = dataRemaining;
}
} // namespace bb::messaging
