// Echo IPC server (C++) — provides handler specializations for the
// header-only generated dispatch.
// Usage: echo_server --socket /tmp/echo.sock

#include "generated/echo_ipc_server.hpp"

#include <iostream>
#include <string_view>

namespace echo {

struct EchoCtx {}; // empty context for the echo service

// Template specializations — echo input fields back in response.
template <>
wire::EchoBytesResponse handle_bytes(EchoCtx & /*ctx*/, wire::EchoBytes &&cmd) {
  return {.data = std::move(cmd.data)};
}

template <>
wire::EchoFieldsResponse handle_fields(EchoCtx & /*ctx*/,
                                       wire::EchoFields &&cmd) {
  return {.a = cmd.a, .b = cmd.b, .name = std::move(cmd.name)};
}

template <>
wire::EchoNestedResponse handle_nested(EchoCtx & /*ctx*/,
                                       wire::EchoNested &&cmd) {
  return {.inner = std::move(cmd.inner)};
}

template <>
wire::EchoAliasesResponse handle_aliases(EchoCtx & /*ctx*/,
                                         wire::EchoAliases &&cmd) {
  return {.treeId = cmd.treeId,
          .hash = cmd.hash,
          .maybeHash = cmd.maybeHash,
          .hashes = std::move(cmd.hashes)};
}

} // namespace echo

int main(int argc, char **argv) {
  const char *socket_path = nullptr;
  for (int i = 1; i < argc - 1; i++) {
    if (std::string_view(argv[i]) == "--socket")
      socket_path = argv[i + 1];
  }
  if (!socket_path) {
    std::cerr << "Usage: echo_server --socket <path>\n";
    return 1;
  }

  echo::EchoCtx ctx;
  echo::serve(socket_path, ctx);
  return 0;
}
