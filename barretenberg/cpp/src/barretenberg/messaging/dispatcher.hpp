#pragma once

#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include <cstdint>
#include <functional>
#include <stdexcept>
#include <utility>
#include <vector>

namespace bb::messaging {

using message_handler = std::function<bool(msgpack::object&, msgpack::sbuffer&)>;

class MessageDispatcher {
  private:
    std::unordered_map<uint32_t, message_handler> messageHandlers;

  public:
    MessageDispatcher() = default;

    bool onNewData(msgpack::object& obj, msgpack::sbuffer& buffer) const
    {
        bb::messaging::HeaderOnlyMessage header;
        obj.convert(header);

        auto iter = messageHandlers.find(header.msgType);
        if (iter == messageHandlers.end()) {
            throw std::runtime_error("No registered handler for message of type " + std::to_string(header.msgType));
        }

        return (iter->second)(obj, buffer);
    }

    void registerTarget(uint32_t msgType, const message_handler& handler)
    {
        messageHandlers.insert({ msgType, handler });
    }
};

} // namespace bb::messaging
