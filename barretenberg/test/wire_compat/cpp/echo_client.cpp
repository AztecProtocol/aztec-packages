/**
 * Echo IPC client (C++) — connects, sends test commands, verifies responses.
 * Usage: echo_client --socket /tmp/echo.sock
 * Exits 0 on success, 1 on failure.
 *
 * Standalone — uses raw msgpack-c and UDS, no barretenberg deps.
 */

#include "echo_common.hpp"
#include <iostream>
#include <cassert>
#include <string_view>

// Send a command and receive a NamedUnion response
static std::pair<std::string, msgpack::object_handle>
send_recv(int fd, const std::string& cmd_name, const auto& fields) {
    // Serialize as [[cmdName, fields]]
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(cmd_name);
    pk.pack(fields);

    send_framed(fd, buf.data(), buf.size());

    auto resp = recv_framed(fd);
    auto oh = msgpack::unpack(reinterpret_cast<const char*>(resp.data()), resp.size());
    auto obj = oh.get();
    std::string resp_name(obj.via.array.ptr[0].via.str.ptr, obj.via.array.ptr[0].via.str.size);
    // Return the handle to keep the object alive
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

    // Test 1: EchoBytes
    {
        EchoBytes cmd;
        cmd.data = { 0xDE, 0xAD, 0xBE, 0xEF, 0x42 };
        auto [name, oh] = send_recv(fd, "EchoBytes", cmd);
        assert(name == "EchoBytesResponse");
        EchoBytes resp;
        oh.get().via.array.ptr[1].convert(resp);
        assert(resp.data == cmd.data);
        std::cerr << "echo_client(cpp): EchoBytes OK\n";
    }

    // Test 2: EchoFields
    {
        EchoFields cmd;
        cmd.a = 42;
        cmd.b = 999999;
        cmd.name = "hello wire compat";
        auto [name, oh] = send_recv(fd, "EchoFields", cmd);
        assert(name == "EchoFieldsResponse");
        EchoFields resp;
        oh.get().via.array.ptr[1].convert(resp);
        assert(resp.a == 42);
        assert(resp.b == 999999);
        assert(resp.name == "hello wire compat");
        std::cerr << "echo_client(cpp): EchoFields OK\n";
    }

    // Test 3: EchoNested
    {
        EchoNested cmd;
        cmd.inner.values = { {1, 2, 3}, {4, 5} };
        cmd.inner.flag = true;
        auto [name, oh] = send_recv(fd, "EchoNested", cmd);
        assert(name == "EchoNestedResponse");
        EchoNested resp;
        oh.get().via.array.ptr[1].convert(resp);
        assert(resp.inner.values == cmd.inner.values);
        assert(resp.inner.flag == cmd.inner.flag);
        std::cerr << "echo_client(cpp): EchoNested OK\n";
    }

    // Shutdown
    {
        msgpack::sbuffer empty;
        msgpack::packer<msgpack::sbuffer> pk(empty);
        pk.pack_map(0);

        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk2(buf);
        pk2.pack_array(1);
        pk2.pack_array(2);
        pk2.pack(std::string("EchoShutdown"));
        pk2.pack_map(0);
        send_framed(fd, buf.data(), buf.size());
        // Read shutdown response (may or may not arrive)
        try { recv_framed(fd); } catch (...) {}
    }

    close(fd);
    std::cerr << "echo_client(cpp): all tests passed\n";
    return 0;
}
