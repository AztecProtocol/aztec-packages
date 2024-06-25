#include "barretenberg/messaging/header.hpp"
#include "barretenberg/messaging/stream_parser.hpp"
#include "barretenberg/world_state/service/message.hpp"
#include "barretenberg/world_state/service/world_state_service.hpp"
#include "std_io.hpp"
#include <cstdint>
#include <functional>
#include <iostream>

using namespace bb::world_state;

template <typename T> void waitForStream(std::basic_istream<char>& inputStream, StreamDispatcher<T>& dispatcher)
{
    msgpack::unpacker unp;
    bool moreDataExpected = true;
    while (moreDataExpected) {
        unp.reserve_buffer(1);
        inputStream.read(unp.buffer(), 1);
        unp.buffer_consumed(1);

        msgpack::object_handle result;
        while (moreDataExpected && unp.next(result)) {
            msgpack::object obj(result.get());
            moreDataExpected = dispatcher.onNewData(obj);
        }
    }
}

int main(int, char**)
{
    SynchronisedStdOutput outputStream(std::cout);
    WorldStateService<SynchronisedStdOutput> service(outputStream, 16);
    StreamDispatcher<SynchronisedStdOutput> dispatcher(outputStream);

    std::function<bool(msgpack::object&)> f1 = [&service](msgpack::object& obj) { return service.startTree(obj); };
    dispatcher.registerTarget(WorldStateMsgTypes::START_TREE_REQUEST, f1);

    std::function<bool(msgpack::object&)> f2 = [&service](msgpack::object& obj) { return service.getTreeInfo(obj); };
    dispatcher.registerTarget(WorldStateMsgTypes::GET_TREE_INFO_REQUEST, f2);

    std::function<bool(msgpack::object&)> f3 = [&service](msgpack::object& obj) { return service.insertLeaves(obj); };
    dispatcher.registerTarget(WorldStateMsgTypes::INSERT_LEAVES_REQUEST, f3);

    waitForStream(std::cin, dispatcher);
}