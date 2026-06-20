// Echo IPC server (C++) — provides handler specializations for the
// header-only generated dispatch.
// Usage: echo_server --socket /tmp/echo.sock

#include "generated/echo_ipc_server.hpp"

#include <iostream>
#include <stdexcept>
#include <string_view>

namespace echo {

struct EchoCtx {}; // empty context for the echo service

// Template specializations — echo input fields back in response. Handlers are
// asynchronous: they produce their result via respond.ok(...) (synchronously
// here; a real service could defer to a thread pool and respond later).
template <>
void handle_bytes(EchoCtx & /*ctx*/, wire::EchoBytes &&cmd,
                  Responder<wire::EchoBytesResponse> respond) {
  respond.ok({.data = std::move(cmd.data)});
}

template <>
void handle_fields(EchoCtx & /*ctx*/, wire::EchoFields &&cmd,
                   Responder<wire::EchoFieldsResponse> respond) {
  respond.ok({.a = cmd.a, .b = cmd.b, .name = std::move(cmd.name)});
}

template <>
void handle_nested(EchoCtx & /*ctx*/, wire::EchoNested &&cmd,
                   Responder<wire::EchoNestedResponse> respond) {
  respond.ok({.inner = std::move(cmd.inner)});
}

template <>
void handle_aliases(EchoCtx & /*ctx*/, wire::EchoAliases &&cmd,
                    Responder<wire::EchoAliasesResponse> respond) {
  respond.ok({.treeId = cmd.treeId,
              .hash = cmd.hash,
              .maybeHash = cmd.maybeHash,
              .hashes = std::move(cmd.hashes)});
}

template <>
void handle_blobs(EchoCtx & /*ctx*/, wire::EchoBlobs &&cmd,
                  Responder<wire::EchoBlobsResponse> respond) {
  respond.ok(
      {.maybeData = std::move(cmd.maybeData), .parts = std::move(cmd.parts)});
}

template <>
void handle_fail(EchoCtx & /*ctx*/, wire::EchoFail &&cmd,
                 Responder<wire::EchoFailResponse> /*respond*/) {
  // Throwing is turned into an error frame by the generated dispatch.
  throw std::runtime_error(cmd.message);
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
