// Echo IPC server (C++) over the header-only generated dispatch and
// ipc-runtime's socket/shared-memory server.
// Usage: echo_server --socket /tmp/echo.sock [--host-call peer=<path>]...
//
// On a socket it is served as an asynchronous instance, re-entrantly on one
// thread, so a Relay whose "peer" calls back into this server is answered while
// the hops before it wait. Shared memory is not re-entrant: there it serves one
// request at a time, its host calls blocking.

#include "generated/echo_ipc_server.hpp"

#include <iostream>
#include <string_view>

int main(int argc, char **argv) {
  const char *socket_path = nullptr;
  echo::ServeOptions options;
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

  options.asynchronous = !std::string_view(socket_path).ends_with(".shm");
  echo::serve(socket_path, options);
  return 0;
}
