// Echo IPC client (C++) — uses the generated EchoIpcClient.
// Usage: echo_client --socket /tmp/echo.sock

#include "generated/echo_ipc_client.hpp"

#include <cassert>
#include <iostream>
#include <string_view>

int main(int argc, char **argv) {
  const char *socket_path = nullptr;
  for (int i = 1; i < argc - 1; i++) {
    if (std::string_view(argv[i]) == "--socket")
      socket_path = argv[i + 1];
  }
  if (!socket_path) {
    std::cerr << "Usage: echo_client --socket <path>\n";
    return 1;
  }

  echo::EchoIpcClient client(socket_path);

  {
    auto resp = client.bytes({.data = {0xDE, 0xAD, 0xBE, 0xEF, 0x42}});
    assert((resp.data == std::vector<uint8_t>{0xDE, 0xAD, 0xBE, 0xEF, 0x42}));
    std::cerr << "echo_client(cpp): EchoBytes OK\n";
  }

  {
    auto resp =
        client.fields({.a = 42, .b = 999999, .name = "hello wire compat"});
    assert(resp.a == 42 && resp.b == 999999 &&
           resp.name == "hello wire compat");
    std::cerr << "echo_client(cpp): EchoFields OK\n";
  }

  {
    auto resp =
        client.nested({.inner = {.values = {{1, 2, 3}, {4, 5}}, .flag = true}});
    assert((resp.inner.values ==
            std::vector<std::vector<uint8_t>>{{1, 2, 3}, {4, 5}}));
    assert(resp.inner.flag == true);
    std::cerr << "echo_client(cpp): EchoNested OK\n";
  }

  client.shutdown();
  std::cerr << "echo_client(cpp): all tests passed\n";
  return 0;
}
