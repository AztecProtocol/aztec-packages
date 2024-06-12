

#include "world_state_service.hpp"
#include "barretenberg/messaging/header.hpp"
#include <cstdint>

template <typename OutputStream>
bool WorldStateService<OutputStream>::processMessage(const MsgHeader* header, const char*)
{
    if (header->msgType == SystemMsgTypes::TERMINATE) {
        return false;
    }
    if (header->msgType == SystemMsgTypes::PONG) {
        sendPong(header->msgId);
    }
    return true;
}

template <typename OutputStream> void WorldStateService<OutputStream>::sendPong(uint32_t pingId)
{
    MsgHeader header(SystemMsgTypes::PONG, pingId);
    outputStream.send(&header);
}