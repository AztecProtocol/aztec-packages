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

void waitForInput(std::basic_istream<char>& inputStream, StreamParser& parser)
{
    bool terminate = false;
    while (terminate) {
        std::array<char, 1024> data;
        std::cout << "Getting input " << std::endl;
        inputStream.getline(data.data(), 1024);
        std::cout << "After input" << std::endl;
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
    void send(MsgHeader* header)
    {
        std::unique_lock<std::mutex> lock(mutex);
        header->msgId = msgId++;
        const char* data = reinterpret_cast<char*>(header);
        stream.write(data, header->msgLength);
    }
};