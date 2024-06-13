#pragma once
#include <cstdint>
#include <cstring>

namespace bb::messaging {
const uint32_t MAGIC_STRING_LENGTH = 8;
const uint8_t MAGIC_STRING[] = "AZTEC!!!"; // The null terminator is not included

enum SystemMsgTypes { TERMINATE = 0, PING = 1, PONG = 2 };

const uint32_t FIRST_APP_MSG_TYPE = 100;

#pragma pack(push, 1)
struct MsgHeader {
    uint8_t msgStart[MAGIC_STRING_LENGTH]; // MAGIC_STRING
    uint32_t msgLength;                    // Length including the header
    uint32_t msgType;                      // The type of message
    uint32_t msgId;                        // Unique Id for the message
    uint32_t requestId;                    // Id of the message this is responding too (may not be used)

    MsgHeader(uint32_t type, uint32_t reqId, uint32_t lengthWithoutHeader = 0)
        : msgLength(sizeof(MsgHeader) + lengthWithoutHeader)
        , msgType(type)
        , requestId(reqId)
    {
        std::memcpy(msgStart, MAGIC_STRING, MAGIC_STRING_LENGTH);
    }

    // MsgHeader(uint32_t type, uint32_t reqId, uint32_t msgId, uint32_t totalLength)
    //     : MsgHeader(type, reqId)
    // {
    //     this->msgId = msgId;
    //     this->msgLength = totalLength;
    // }
};
#pragma pack(pop)

const uint32_t HEADER_SIZE = sizeof(MsgHeader);
} // namespace bb::messaging
