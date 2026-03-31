/**
 * Echo IPC client (C++) — uses GENERATED types + IPC client template.
 * Usage: echo_client --socket /tmp/echo.sock
 *
 * Note: The generated EchoIpcClient (.hpp/.cpp) depends on barretenberg
 * msgpack headers which are not available in this standalone test context.
 * Instead we build a thin client directly on the generated types + ipc_client.
 */

#include "generated/echo_types.hpp"
#include "generated/ipc_client.hpp"

// Need msgpack for serialization + barretenberg's SERIALIZATION_FIELDS adaptor
#ifndef THROW
#define THROW throw
#endif
#ifndef RETHROW
#define RETHROW throw
#endif
#include <msgpack.hpp>
#include "struct_map_impl.hpp"

#include <cassert>
#include <iostream>
#include <string_view>

using namespace echo::wire;

template <typename Cmd, typename Resp>
Resp call(ipc::IpcClient& client, Cmd&& cmd) {
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1); pk.pack_array(2);
    pk.pack(std::string(Cmd::MSGPACK_SCHEMA_NAME));
    pk.pack(std::forward<Cmd>(cmd));

    auto resp = client.call(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
    auto oh = msgpack::unpack(reinterpret_cast<const char*>(resp.data()), resp.size());
    auto obj = oh.get();
    std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    if (resp_name == "EchoErrorResponse") throw std::runtime_error("server error");
    Resp result; obj.via.array.ptr[1].convert(result);
    return result;
}

int main(int argc, char** argv) {
    const char* socket_path = nullptr;
    for (int i = 1; i < argc - 1; i++) {
        if (std::string_view(argv[i]) == "--socket") socket_path = argv[i + 1];
    }
    if (!socket_path) { std::cerr << "Usage: echo_client --socket <path>\n"; return 1; }

    ipc::IpcClient client(socket_path);

    // EchoBytes
    {
        EchoBytes cmd{ .data = { 0xDE, 0xAD, 0xBE, 0xEF, 0x42 } };
        auto resp = call<EchoBytes, EchoBytesResponse>(client, std::move(cmd));
        assert((resp.data == std::vector<uint8_t>{ 0xDE, 0xAD, 0xBE, 0xEF, 0x42 }));
        std::cerr << "echo_client(cpp): EchoBytes OK\n";
    }

    // EchoFields
    {
        EchoFields cmd{ .a = 42, .b = 999999, .name = "hello wire compat" };
        auto resp = call<EchoFields, EchoFieldsResponse>(client, std::move(cmd));
        assert(resp.a == 42 && resp.b == 999999 && resp.name == "hello wire compat");
        std::cerr << "echo_client(cpp): EchoFields OK\n";
    }

    // EchoNested
    {
        EchoNested cmd{ .inner = { .values = { {1, 2, 3}, {4, 5} }, .flag = true } };
        auto resp = call<EchoNested, EchoNestedResponse>(client, std::move(cmd));
        assert((resp.inner.values == std::vector<std::vector<uint8_t>>{ {1, 2, 3}, {4, 5} }));
        assert(resp.inner.flag == true);
        std::cerr << "echo_client(cpp): EchoNested OK\n";
    }

    // Shutdown
    {
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack_array(1); pk.pack_array(2);
        pk.pack(std::string("EchoShutdown")); pk.pack_map(0);
        client.call(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
    }

    std::cerr << "echo_client(cpp): all tests passed\n";
    return 0;
}
