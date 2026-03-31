/**
 * Echo IPC server (C++) — uses GENERATED dispatch + template Ctx.
 * Usage: echo_server --socket /tmp/echo.sock
 */

// barretenberg's custom msgpack adaptor for SERIALIZATION_FIELDS —
// enables msgpack::object::convert() to work with the generated types.
// Must be included before echo_ipc_server.hpp which uses convert()/pack().
#include "generated/echo_types.hpp"
#ifndef THROW
#define THROW throw
#endif
#ifndef RETHROW
#define RETHROW throw
#endif
#include <msgpack.hpp>
#include "struct_map_impl.hpp"

// The generated server header declares template handler functions.
// We need to see those declarations before providing specializations.
// Importantly, make_echo_handler() is defined inline but only instantiated
// when serve() is called in main() — so specializations defined after
// the header but before main() are visible at instantiation time.
#include "generated/echo_ipc_server.hpp"

#include <iostream>
#include <string_view>

namespace echo {

struct EchoCtx {}; // empty context for the echo service

// Template specializations — echo input fields back in response.
template <>
wire::EchoBytesResponse handle_bytes(EchoCtx& /*ctx*/, wire::EchoBytes&& cmd) {
    return { .data = std::move(cmd.data) };
}

template <>
wire::EchoFieldsResponse handle_fields(EchoCtx& /*ctx*/, wire::EchoFields&& cmd) {
    return { .a = cmd.a, .b = cmd.b, .name = std::move(cmd.name) };
}

template <>
wire::EchoNestedResponse handle_nested(EchoCtx& /*ctx*/, wire::EchoNested&& cmd) {
    return { .inner = std::move(cmd.inner) };
}

} // namespace echo

int main(int argc, char** argv) {
    const char* socket_path = nullptr;
    for (int i = 1; i < argc - 1; i++) {
        if (std::string_view(argv[i]) == "--socket") socket_path = argv[i + 1];
    }
    if (!socket_path) { std::cerr << "Usage: echo_server --socket <path>\n"; return 1; }

    echo::EchoCtx ctx;
    echo::serve(socket_path, ctx);
    return 0;
}
