#pragma once

#include "barretenberg/messaging/header.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <atomic>
#include <cstdint>
#include <functional>
#include <mutex>
#include <shared_mutex>
#include <stdexcept>
#include <thread>
#include <utility>
#include <vector>

namespace bb::messaging {

using message_handler = std::function<bool(msgpack::object&, msgpack::sbuffer&)>;
struct MessageHandler {
    bool unique;
    message_handler handler;
};

class MessageDispatcher {
  private:
    std::unordered_map<uint32_t, MessageHandler> message_handlers;
    mutable std::shared_mutex mutex;

  public:
    MessageDispatcher() = default;

    bool on_new_data(msgpack::object& obj, msgpack::sbuffer& buffer) const
    {
        bb::messaging::HeaderOnlyMessage header;
        obj.convert(header);

        auto iter = message_handlers.find(header.msgType);
        if (iter == message_handlers.end()) {
            throw std::runtime_error("No registered handler for message of type " + std::to_string(header.msgType));
        }

        // If the msg type has been marked as 'unique' then we need to give it exclusive execution context
        if (iter->second.unique) {
            std::unique_lock<std::shared_mutex> lock(mutex);
            return (iter->second.handler)(obj, buffer);
        }
        std::shared_lock<std::shared_mutex> lock(mutex);
        return (iter->second.handler)(obj, buffer);
    }

    void register_target(uint32_t msgType, const message_handler& handler, bool unique = false)
    {
        MessageHandler msg_handler{ unique, handler };
        message_handlers.insert({ msgType, msg_handler });
    }
};

} // namespace bb::messaging
