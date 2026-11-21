// Echo IPC server (C++) over the header-only generated dispatch and
// ipc-runtime's socket/shared-memory server.
// Usage: echo_server --socket /tmp/echo.sock [--host-call peer=<path>]...
//
// Served as an asynchronous instance, so a Relay whose "peer" calls back into
// this server is answered while the hops before it wait.

#include "generated/echo_ipc_server.hpp"

#include <iostream>
#include <string_view>

int main(int argc, char **argv) {
  const char *socket_path = nullptr;
  echo::ServeOptions options{.asynchronous = true};
  for (int i = 1; i < argc - 1; i++) {
    if (std::string_view(argv[i]) == "--socket")
      socket_path = argv[i + 1];
    if (std::string_view(argv[i]) == "--host-call")
      options.host_calls.push_back(ipc_codegen::parse_host_call(argv[i + 1]));
  }
  if (!socket_path) {
    std::cerr << "Usage: echo_server --socket <path>\n";
    return 1;
  }

  echo::serve(socket_path, options);
  return 0;
}
