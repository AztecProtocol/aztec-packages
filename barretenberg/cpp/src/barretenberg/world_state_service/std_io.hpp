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
    std::vector<char> buffer(1);
    while (inputStream.read(&buffer[0], 1)) {
        bool moreDataExpected = parser.onNewData(buffer.data(), 1);
        if (!moreDataExpected) {
            break;
        }
    }
};

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
        stream.flush();
    }
};