#pragma once

#include "barretenberg/messaging/header.hpp"
#include <cstdint>
#include <functional>
#include <utility>
#include <vector>

class StreamParser {
  private:
    std::vector<char> buffer;
    uint32_t bufferLength = 0;
    uint32_t readPointer = 0;
    std::function<bool(const MsgHeader*, const char*)> messageHandler;

    void shrinkBuffer();

  public:
    StreamParser(std::function<bool(const MsgHeader*, const char*)> handler)
        : messageHandler(std::move(handler))
    {}
    bool onNewData(char* data, uint32_t length);
};