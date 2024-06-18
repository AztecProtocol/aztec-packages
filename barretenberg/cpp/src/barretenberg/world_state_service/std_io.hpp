#pragma once

#include "barretenberg/messaging/header.hpp"
#include "barretenberg/messaging/stream_parser.hpp"
#include "barretenberg/serialize/cbind.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/service/message.hpp"

#include <array>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <istream>
#include <mutex>
#include <ostream>
#include <vector>

// struct MsgPackedHeader {
//     uint32_t msgType;
//     msgpack::object header;

//     MSGPACK_FIELDS(msgType, header);
// };

// struct MsgPackedType {
//     uint32_t msgType;
//     msgpack::object header;
//     msgpack::object value;

//     MSGPACK_FIELDS(msgType, header, value);
// };

class SynchronisedStdOutput {
  private:
    std::basic_ostream<char>& stream;
    std::mutex mutex;
    uint32_t msgId = 1;

  public:
    SynchronisedStdOutput(std::basic_ostream<char>& str)
        : stream(str)
    {}
    void send(bb::messaging::HeaderOnlyMessage& header)
    {
        std::unique_lock<std::mutex> lock(mutex);
        header.header.messageId = msgId++;
        msgpack::sbuffer buffer;
        msgpack::pack(buffer, header);
        stream.write(buffer.data(), static_cast<uint32_t>(buffer.size()));
        stream.flush();
    }
    template <typename T> void sendPackedObject(bb::messaging::TypedMessage<T>& header)
    {
        std::unique_lock<std::mutex> lock(mutex);
        header.header.messageId = msgId++;
        msgpack::sbuffer buffer;
        msgpack::pack(buffer, header);
        stream.write(buffer.data(), static_cast<uint32_t>(buffer.size()));
        stream.flush();
    }
};
