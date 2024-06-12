#pragma once
#include "barretenberg/messaging/header.hpp"

using namespace bb::messaging;

namespace bb::world_state {
template <typename OutputStream> class WorldStateService {
  private:
    OutputStream& outputStream;
    void sendPong(uint32_t pingId);

  public:
    WorldStateService(OutputStream& out)
        : outputStream(out)
    {}
    bool processMessage(const MsgHeader* header, const char* data);
};

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
} // namespace bb::world_state