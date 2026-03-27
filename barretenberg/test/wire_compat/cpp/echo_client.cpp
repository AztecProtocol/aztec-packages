/**
 * Echo IPC client (C++) — uses GENERATED types + template IPC client.
 * Usage: echo_client --socket /tmp/echo.sock
 */

#include "generated/types_gen.hpp"
#include "generated/ipc_client.hpp"
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

    ipc::IpcClient client(socket_path);

    auto send_recv = [&](const std::string& name, const auto& cmd) {
        msgpack::sbuffer buf;
        msgpack::packer<msgpack::sbuffer> pk(buf);
        pk.pack_array(1); pk.pack_array(2); pk.pack(name); pk.pack(cmd);
        return client.call(std::vector<uint8_t>(buf.data(), buf.data() + buf.size()));
    };

    auto resp_name = [](const std::vector<uint8_t>& r) {
        auto oh = msgpack::unpack(reinterpret_cast<const char*>(r.data()), r.size());
        return std::string(oh.get().via.array.ptr[0].via.str.ptr, oh.get().via.array.ptr[0].via.str.size);
    };

    // EchoBytes
    { EchoBytes cmd{.data={0xDE,0xAD,0xBE,0xEF,0x42}};
      auto r = send_recv("EchoBytes", cmd); assert(resp_name(r) == "EchoBytesResponse");
      auto oh = msgpack::unpack(reinterpret_cast<const char*>(r.data()), r.size());
      EchoBytes res; oh.get().via.array.ptr[1].convert(res); assert(res.data == cmd.data);
      std::cerr << "echo_client(cpp): EchoBytes OK\n"; }

    // EchoFields
    { EchoFields cmd{.a=42,.b=999999,.name="hello wire compat"};
      auto r = send_recv("EchoFields", cmd); assert(resp_name(r) == "EchoFieldsResponse");
      auto oh = msgpack::unpack(reinterpret_cast<const char*>(r.data()), r.size());
      EchoFields res; oh.get().via.array.ptr[1].convert(res);
      assert(res.a==42 && res.b==999999 && res.name=="hello wire compat");
      std::cerr << "echo_client(cpp): EchoFields OK\n"; }

    // EchoNested
    { EchoNested cmd; cmd.inner.values={{1,2,3},{4,5}}; cmd.inner.flag=true;
      auto r = send_recv("EchoNested", cmd); assert(resp_name(r) == "EchoNestedResponse");
      auto oh = msgpack::unpack(reinterpret_cast<const char*>(r.data()), r.size());
      EchoNested res; oh.get().via.array.ptr[1].convert(res);
      assert(res.inner.values==cmd.inner.values && res.inner.flag==cmd.inner.flag);
      std::cerr << "echo_client(cpp): EchoNested OK\n"; }

    // Shutdown
    { msgpack::sbuffer buf; msgpack::packer<msgpack::sbuffer> pk(buf);
      pk.pack_array(1); pk.pack_array(2); pk.pack(std::string("EchoShutdown")); pk.pack_map(0);
      client.call(std::vector<uint8_t>(buf.data(), buf.data() + buf.size())); }

    std::cerr << "echo_client(cpp): all tests passed\n";
    return 0;
}
