/**
 * Echo IPC client (C++) — uses GENERATED types for serialization.
 * Usage: echo_client --socket /tmp/echo.sock
 * Exits 0 on success, 1 on failure.
 */

#include "generated/types.hpp"
#include "echo_common.hpp"
#include <iostream>
#include <cassert>
#include <string_view>

using namespace echo;

// Send a command using GENERATED types and receive a NamedUnion response
template <typename Cmd>
static std::pair<std::string, msgpack::object_handle>
send_recv(int fd, const std::string& cmd_name, const Cmd& cmd) {
    // Serialize as [[cmdName, fields]] using generated MSGPACK_DEFINE_MAP
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(cmd_name);
    pk.pack(cmd);  // Uses generated MSGPACK_DEFINE_MAP

    send_framed(fd, buf.data(), buf.size());

    auto resp = recv_framed(fd);
    auto oh = msgpack::unpack(reinterpret_cast<const char*>(resp.data()), resp.size());
    auto obj = oh.get();
    std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    return { resp_name, std::move(oh) };
}

int main(int argc, char** argv) {
    const char* socket_path = nullptr;
    for (int i = 1; i < argc - 1; i++) {
        if (std::string_view(argv[i]) == "--socket") {
            socket_path = argv[i + 1];
        }
    }
    if (!socket_path) {
        std::cerr << "Usage: echo_client --socket <path>\n";
        return 1;
    }

    int fd = connect_socket(socket_path);

    // Test 1: EchoBytes — using GENERATED type
    {
        EchoBytes cmd{ .data = { 0xDE, 0xAD, 0xBE, 0xEF, 0x42 } };
        auto [name, oh] = send_recv(fd, "EchoBytes", cmd);
        assert(name == "EchoBytesResponse");
        EchoBytesResponse resp;
        oh.get().via.array.ptr[1].convert(resp);  // Deserialize using GENERATED type
        assert(resp.data == cmd.data);
        std::cerr << "echo_client(cpp): EchoBytes OK\n";
    }

    // Test 2: EchoFields — using GENERATED type
    {
        EchoFields cmd{ .a = 42, .b = 999999, .name = "hello wire compat" };
        auto [name, oh] = send_recv(fd, "EchoFields", cmd);
        assert(name == "EchoFieldsResponse");
        EchoFieldsResponse resp;
        oh.get().via.array.ptr[1].convert(resp);
        assert(resp.a == 42);
        assert(resp.b == 999999);
        assert(resp.name == "hello wire compat");
        std::cerr << "echo_client(cpp): EchoFields OK\n";
    }

    // Test 3: EchoNested — using GENERATED type
    {
        EchoNested cmd;
        cmd.inner.values = { {1, 2, 3}, {4, 5} };
        cmd.inner.flag = true;
        auto [name, oh] = send_recv(fd, "EchoNested", cmd);
        assert(name == "EchoNestedResponse");
        EchoNestedResponse resp;
        oh.get().via.array.ptr[1].convert(resp);
        assert(resp.inner.values == cmd.inner.values);
        assert(resp.inner.flag == cmd.inner.flag);
        std::cerr << "echo_client(cpp): EchoNested OK\n";
    }

    // Shutdown
    {
        EchoShutdown cmd;
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack_array(1);
        pk.pack_array(2);
        pk.pack(std::string("EchoShutdown"));
        pk.pack(cmd);
        send_framed(fd, buf.data(), buf.size());
        try { recv_framed(fd); } catch (...) {}
    }

    close(fd);
    std::cerr << "echo_client(cpp): all tests passed\n";
    return 0;
}
