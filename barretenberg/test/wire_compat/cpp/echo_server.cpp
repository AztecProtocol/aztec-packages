/**
 * Echo IPC server (C++) — uses GENERATED types + template IPC server.
 * Usage: echo_server --socket /tmp/echo.sock
 */

#include "generated/types_gen.hpp"
#include "generated/ipc_server.hpp"
#include <iostream>
#include <string_view>

using namespace echo;

int main(int argc, char** argv) {
    const char* socket_path = nullptr;
    for (int i = 1; i < argc - 1; i++) {
        if (std::string_view(argv[i]) == "--socket") {
            socket_path = argv[i + 1];
        }
    }
    if (!socket_path) {
        std::cerr << "Usage: echo_server --socket <path>\n";
        return 1;
    }

    // Serve using template IPC server + generated types for dispatch
    ipc::serve(socket_path, [](const std::vector<uint8_t>& payload) -> std::vector<uint8_t> {
        auto oh = msgpack::unpack(reinterpret_cast<const char*>(payload.data()), payload.size());
        auto obj = oh.get();
        auto& inner = obj.via.array.ptr[0];
        std::string cmd_name(inner.via.array.ptr[0].via.str.ptr, inner.via.array.ptr[0].via.str.size);
        auto& cmd_payload = inner.via.array.ptr[1];

        msgpack::sbuffer resp_buf;
        msgpack::packer<msgpack::sbuffer> pk(resp_buf);

        // Echo dispatch using GENERATED types
        if (cmd_name == "EchoBytes") {
            EchoBytes cmd; cmd_payload.convert(cmd);
            pk.pack_array(2); pk.pack(std::string("EchoBytesResponse")); pk.pack(cmd);
        } else if (cmd_name == "EchoFields") {
            EchoFields cmd; cmd_payload.convert(cmd);
            pk.pack_array(2); pk.pack(std::string("EchoFieldsResponse")); pk.pack(cmd);
        } else if (cmd_name == "EchoNested") {
            EchoNested cmd; cmd_payload.convert(cmd);
            pk.pack_array(2); pk.pack(std::string("EchoNestedResponse")); pk.pack(cmd);
        } else if (cmd_name == "EchoShutdown") {
            pk.pack_array(2); pk.pack(std::string("EchoShutdownResponse")); pk.pack_map(0);
        } else {
            pk.pack_array(2); pk.pack(std::string("EchoErrorResponse"));
            pk.pack_map(1); pk.pack(std::string("message")); pk.pack(std::string("Unknown: ") + cmd_name);
        }

        return std::vector<uint8_t>(resp_buf.data(), resp_buf.data() + resp_buf.size());
    });

    return 0;
}
