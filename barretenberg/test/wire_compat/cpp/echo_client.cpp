/**
 * Echo IPC client (C++) — uses GENERATED typed client.
 * Usage: echo_client --socket /tmp/echo.sock
 */

#include "generated/client_gen.hpp"
#include <iostream>
#include <cassert>
#include <string_view>

using namespace echo;

int main(int argc, char** argv) {
    const char* socket_path = nullptr;
    for (int i = 1; i < argc - 1; i++) {
        if (std::string_view(argv[i]) == "--socket") socket_path = argv[i + 1];
    }
    if (!socket_path) { std::cerr << "Usage: echo_client --socket <path>\n"; return 1; }

    EchoClient client(socket_path);

    // EchoBytes — using generated typed client method
    {
        EchoBytes cmd{ .data = { 0xDE, 0xAD, 0xBE, 0xEF, 0x42 } };
        auto resp = client.bytes(cmd);
        assert(resp.data == cmd.data);
        std::cerr << "echo_client(cpp): EchoBytes OK\n";
    }

    // EchoFields
    {
        EchoFields cmd{ .a = 42, .b = 999999, .name = "hello wire compat" };
        auto resp = client.fields(cmd);
        assert(resp.a == 42 && resp.b == 999999 && resp.name == "hello wire compat");
        std::cerr << "echo_client(cpp): EchoFields OK\n";
    }

    // EchoNested
    {
        EchoNested cmd; cmd.inner.values = { {1, 2, 3}, {4, 5} }; cmd.inner.flag = true;
        auto resp = client.nested(cmd);
        assert(resp.inner.values == cmd.inner.values && resp.inner.flag == cmd.inner.flag);
        std::cerr << "echo_client(cpp): EchoNested OK\n";
    }

    client.shutdown();
    std::cerr << "echo_client(cpp): all tests passed\n";
    return 0;
}
