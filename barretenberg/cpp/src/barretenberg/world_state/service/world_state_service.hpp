#pragma once
#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/world_state/service/message.hpp"
#include "msgpack/v3/sbuffer_decl.hpp"
#include <cstdint>
#include <functional>
#include <iostream>
#include <unordered_map>

using namespace bb::messaging;

namespace bb::world_state {
template <typename OutputStream> class WorldStateService {
  private:
    OutputStream& outputStream;
    std::unordered_map<WorldStateMsgTypes, std::function<void(uint32_t, const char*, uint32_t)>> messagesHandlers;
    void sendPong(uint32_t pingId);

    void startTree(uint32_t requestId, const char* data, uint32_t length);

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
        std::cerr << "Terminating!!" << std::endl;
        return false;
    }
    if (header->msgType == SystemMsgTypes::PING) {
        sendPong(header->msgId);
    }
    return true;
}

template <typename OutputStream> void WorldStateService<OutputStream>::sendPong(uint32_t pingId)
{
    MsgHeader header(SystemMsgTypes::PONG, pingId);
    outputStream.send(&header);
}

template <typename OutputStream>
void WorldStateService<OutputStream>::startTree(uint32_t requestId, const char* data, uint32_t length)
{
    StartTreeRequest startTreeRequest;
    msgpack::unpack(data, length).get().convert(startTreeRequest);
    std::cout << "Received Start Tree Request " << startTreeRequest.name << " " << startTreeRequest.depth << std::endl;

    StartTreeResponse response;
    response.depth = startTreeRequest.depth;
    response.name = startTreeRequest.name;
    response.reason = "Hello!";
    response.success = true;

    msgpack::sbuffer buffer;
    msgpack::pack(buffer, response);

    MsgHeader header(WorldStateMsgTypes::START_TREE_RESPONSE, requestId, buffer.size());

    outputStream.send(&header, buffer.data());
}
} // namespace bb::world_state