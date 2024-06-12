#pragma once

#include "barretenberg/messaging/stream_parser.hpp"
#include <array>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <istream>
#include <mutex>
#include <ostream>
#include <vector>

void waitForInput(std::basic_istream<char>& inputStream, bb::messaging::StreamParser& parser)
{
    bool terminate = false;
    while (!terminate) {
        std::array<char, 1024> data;
        inputStream.getline(data.data(), 1024);
        uint32_t length = static_cast<uint32_t>(inputStream.gcount());
        terminate = parser.onNewData(data.data(), length);
    }
}

class SynchronisedStdOutput {
  private:
    std::basic_ostream<char>& stream;
    std::mutex mutex;
    uint32_t msgId = 1;

  public:
    SynchronisedStdOutput(std::basic_ostream<char>& str)
        : stream(str)
    {}
    void send(bb::messaging::MsgHeader* header)
    {
        std::unique_lock<std::mutex> lock(mutex);
        header->msgId = msgId++;
        const char* data = reinterpret_cast<char*>(header);
        stream.write(data, header->msgLength);
    }
};