// Echo IPC client (C++) — uses the generated EchoIpcClient.
// Usage: echo_client --socket /tmp/echo.sock

#include "generated/echo_ipc_client.hpp"

#include <array>
#include <iostream>
#include <string_view>

// Explicit check (not assert): verification must survive NDEBUG builds.
#define CHECK(cond, label)                                                     \
  do {                                                                         \
    if (!(cond)) {                                                             \
      std::cerr << "echo_client(cpp): " << (label) << " FAIL\n";               \
      return 1;                                                                \
    }                                                                          \
  } while (0)

namespace {
echo::Fr test_hash(uint8_t base) {
  echo::Fr hash{};
  for (size_t i = 0; i < hash.size(); ++i) {
    hash[i] = static_cast<uint8_t>(base + i);
  }
  return hash;
}
} // namespace

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
    CHECK((resp.data == std::vector<uint8_t>{0xDE, 0xAD, 0xBE, 0xEF, 0x42}),
          "EchoBytes");
    std::cerr << "echo_client(cpp): EchoBytes OK\n";
  }

  {
    auto resp =
        client.fields({.a = 42, .b = 999999, .name = "hello wire compat"});
    CHECK(resp.a == 42 && resp.b == 999999 && resp.name == "hello wire compat",
          "EchoFields");
    std::cerr << "echo_client(cpp): EchoFields OK\n";
  }

  {
    auto resp =
        client.nested({.inner = {.values = {{1, 2, 3}, {4, 5}}, .flag = true}});
    CHECK((resp.inner.values ==
           std::vector<std::vector<uint8_t>>{{1, 2, 3}, {4, 5}}),
          "EchoNested values");
    CHECK(resp.inner.flag == true, "EchoNested flag");
    std::cerr << "echo_client(cpp): EchoNested OK\n";
  }

  {
    auto hash = test_hash(0x10);
    auto second = test_hash(0x40);
    auto resp = client.aliases({.treeId = 7,
                                .hash = hash,
                                .maybeHash = second,
                                .hashes = {hash, second}});
    CHECK(resp.treeId == 7, "EchoAliases treeId");
    CHECK(resp.hash == hash, "EchoAliases hash");
    CHECK(resp.maybeHash == second, "EchoAliases maybeHash");
    CHECK((resp.hashes == std::vector<echo::Fr>{hash, second}),
          "EchoAliases hashes");
    std::cerr << "echo_client(cpp): EchoAliases OK\n";
  }

  // Optional-absent over live IPC.
  {
    auto hash = test_hash(0x10);
    auto resp = client.aliases({.treeId = 7,
                                .hash = hash,
                                .maybeHash = std::nullopt,
                                .hashes = {hash}});
    CHECK(!resp.maybeHash.has_value(), "EchoAliases none");
    std::cerr << "echo_client(cpp): EchoAliases none OK\n";
  }

  // uint64 wire encoding above 2^32 over live IPC.
  {
    const uint64_t big = (1ULL << 53) - 1;
    auto resp = client.fields({.a = 42, .b = big, .name = "big"});
    CHECK(resp.b == big, "EchoFields u64");
    std::cerr << "echo_client(cpp): EchoFields u64 OK\n";
  }

  // Optional bytes Some/None and fixed [bytes; 2].
  {
    auto resp = client.blobs({.maybeData = std::vector<uint8_t>{0xAA, 0xBB},
                              .parts = {{{1, 2, 3}, {4}}}});
    CHECK((resp.maybeData == std::vector<uint8_t>{0xAA, 0xBB}),
          "EchoBlobs maybeData");
    CHECK((resp.parts == std::array<std::vector<uint8_t>, 2>{{{1, 2, 3}, {4}}}),
          "EchoBlobs parts");
    auto resp_none =
        client.blobs({.maybeData = std::nullopt, .parts = {{{}, {9}}}});
    CHECK(!resp_none.maybeData.has_value(), "EchoBlobs none");
    std::cerr << "echo_client(cpp): EchoBlobs OK\n";
  }

  // Server error surfaces with its message.
  {
    bool threw = false;
    std::string message;
    try {
      client.fail({.message = "deliberate failure"});
    } catch (const std::exception &e) {
      threw = true;
      message = e.what();
    }
    CHECK(threw, "EchoFail threw");
    CHECK(message.find("deliberate failure") != std::string::npos,
          "EchoFail message");
    std::cerr << "echo_client(cpp): EchoFail OK\n";
  }

  std::cerr << "echo_client(cpp): all tests passed\n";
  return 0;
}
