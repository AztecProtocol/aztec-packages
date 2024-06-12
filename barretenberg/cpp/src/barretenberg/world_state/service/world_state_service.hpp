#pragma once
#include "barretenberg/messaging/header.hpp"

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