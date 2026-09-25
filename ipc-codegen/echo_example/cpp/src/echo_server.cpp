// Echo IPC server (C++) over the header-only generated dispatch and
// ipc-runtime's socket/shared-memory server.
// Usage: echo_server --socket /tmp/echo.sock

#include "echo_handlers.hpp"
#include "generated/echo_ipc_server.hpp"

#include <iostream>
#include <string_view>

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
