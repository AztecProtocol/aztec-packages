/**
 * Echo IPC server (C++) — uses GENERATED types for serialization.
 * Usage: echo_server --socket /tmp/echo.sock
 */

#include "generated/types.hpp"
#include "echo_common.hpp"
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

    int server_fd = create_server_socket(socket_path);
    std::cerr << "echo_server(cpp): listening on " << socket_path << "\n";

    int client_fd = accept(server_fd, nullptr, nullptr);
    if (client_fd < 0) { std::cerr << "accept() failed\n"; return 1; }

    while (true) {
        std::vector<uint8_t> payload;
        try {
            payload = recv_framed(client_fd);
        } catch (...) {
            break;
        }

        // Deserialize: [[commandName, {fields}]]
        auto oh = msgpack::unpack(reinterpret_cast<const char*>(payload.data()), payload.size());
        auto obj = oh.get();
        auto& inner = obj.via.array.ptr[0];
        std::string cmd_name(inner.via.array.ptr[0].via.str.ptr, inner.via.array.ptr[0].via.str.size);
        auto& cmd_payload = inner.via.array.ptr[1];

        msgpack::sbuffer resp_buf;
        bool is_shutdown = false;

        // Dispatch using GENERATED types for deserialization/serialization
        if (cmd_name == "EchoBytes") {
            EchoBytes cmd;
            cmd_payload.convert(cmd);
            EchoBytesResponse resp{ .data = cmd.data };
            msgpack::packer<msgpack::sbuffer> pk(resp_buf);
            pk.pack_array(2);
            pk.pack(std::string("EchoBytesResponse"));
            pk.pack(resp);
        } else if (cmd_name == "EchoFields") {
            EchoFields cmd;
            cmd_payload.convert(cmd);
            EchoFieldsResponse resp{ .a = cmd.a, .b = cmd.b, .name = cmd.name };
            msgpack::packer<msgpack::sbuffer> pk(resp_buf);
            pk.pack_array(2);
            pk.pack(std::string("EchoFieldsResponse"));
            pk.pack(resp);
        } else if (cmd_name == "EchoNested") {
            EchoNested cmd;
            cmd_payload.convert(cmd);
            EchoNestedResponse resp{ .inner = cmd.inner };
            msgpack::packer<msgpack::sbuffer> pk(resp_buf);
            pk.pack_array(2);
            pk.pack(std::string("EchoNestedResponse"));
            pk.pack(resp);
        } else if (cmd_name == "EchoShutdown") {
            msgpack::packer<msgpack::sbuffer> pk(resp_buf);
            pk.pack_array(2);
            pk.pack(std::string("EchoShutdownResponse"));
            pk.pack_map(0);
            is_shutdown = true;
        } else {
            EchoErrorResponse err{ .message = "Unknown command: " + cmd_name };
            msgpack::packer<msgpack::sbuffer> pk(resp_buf);
            pk.pack_array(2);
            pk.pack(std::string("EchoErrorResponse"));
            pk.pack(err);
        }

        send_framed(client_fd, resp_buf.data(), resp_buf.size());
        if (is_shutdown) break;
    }

    close(client_fd);
    close(server_fd);
    unlink(socket_path);
    std::cerr << "echo_server(cpp): shutdown\n";
    return 0;
}
