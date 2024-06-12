#include "barretenberg/messaging/header.hpp"
#include "barretenberg/messaging/stream_parser.hpp"
#include "barretenberg/world_state/service/world_state_service.hpp"
#include "std_io.hpp"
#include <functional>
#include <iostream>

int main(int, char**)
{
    std::cout << "Hello World" << std::endl;
    SynchronisedStdOutput outputStream(std::cout);
    WorldStateService<SynchronisedStdOutput> service(outputStream);

    std::function<bool(const MsgHeader*, const char*)> handler = [&service](const MsgHeader* header, const char* data) {
        return service.processMessage(header, data);
    };
    StreamParser parser(handler);
    std::cout << "Hello World" << std::endl;
    waitForInput(std::cin, parser);
}