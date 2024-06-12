#include "barretenberg/messaging/header.hpp"
#include "barretenberg/messaging/stream_parser.hpp"
#include "barretenberg/world_state/service/world_state_service.hpp"
#include "std_io.hpp"
#include <functional>
#include <iostream>

using namespace bb::world_state;

int main(int, char**)
{
    SynchronisedStdOutput outputStream(std::cout);
    WorldStateService<SynchronisedStdOutput> service(outputStream);

    std::function<bool(const MsgHeader*, const char*)> handler = [&service](const MsgHeader* header, const char* data) {
        return service.processMessage(header, data);
    };
    StreamParser parser(handler);
    waitForInput(std::cin, parser);
}