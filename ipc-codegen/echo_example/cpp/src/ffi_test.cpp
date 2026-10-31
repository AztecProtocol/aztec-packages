// In-process round trip (C++): the generated EchoApi over the generated
// FfiBackend, calling this example's own FFI entry (echo_ffi), no process
// involved. The requests the typed API cannot make (an unknown command,
// malformed bytes) go through the backend's raw call().
//
// Usage: ffi_test

#include "generated/echo_client.hpp"
#include "generated/echo_ffi_backend.hpp"

#include <cstdint>
#include <exception>
#include <iostream>
#include <map>
#include <string>
#include <utility>
#include <vector>

namespace {

int g_fail = 0;

void check(bool ok, const std::string &label) {
  std::cerr << (ok ? "  PASS: " : "  FAIL: ") << label << "\n";
  if (!ok)
    g_fail++;
}

// The raw response to a raw request, as [name, {message}] when it is an error.
bool is_error_with(echo::FfiBackend &backend,
                   const std::vector<uint8_t> &request,
                   const std::string &expected) {
  auto response = backend.call(request);
  auto handle = msgpack::unpack(reinterpret_cast<const char *>(response.data()),
                                response.size());
  auto [name, fields] =
      handle.get()
          .as<std::pair<std::string, std::map<std::string, std::string>>>();
  return name == "EchoErrorResponse" &&
         fields["message"].find(expected) != std::string::npos;
}

} // namespace

int main() {
  echo::EchoApi<echo::FfiBackend> api;

  {
    std::vector<uint8_t> data{0xde, 0xad, 0xbe, 0xef, 0x42};
    check(api.bytes({.data = data}).data == data, "EchoBytes round trip");
  }
  {
    auto resp = api.fields({.a = 42, .b = 999999, .name = "hello ffi"});
    check(resp.a == 42 && resp.b == 999999 && resp.name == "hello ffi",
          "EchoFields round trip");
  }
  {
    std::string message;
    try {
      api.fail({.message = "boom"});
    } catch (const std::exception &e) {
      message = e.what();
    }
    check(message.find("boom") != std::string::npos,
          "EchoFail throws the server's message");
  }

  echo::FfiBackend backend;
  {
    msgpack::sbuffer buf;
    msgpack::pack(
        buf, std::vector<std::pair<std::string, int>>{{"NoSuchCommand", 0}});
    check(is_error_with(backend, {buf.data(), buf.data() + buf.size()},
                        "unknown command"),
          "unknown command becomes an error frame");
  }
  // A bare msgpack string where the [[name, payload]] envelope belongs.
  check(is_error_with(backend, {0xa3, 'b', 'a', 'd'}, "malformed request"),
        "malformed input becomes an error frame");

  if (g_fail > 0) {
    std::cerr << "ffi_test: " << g_fail << " failure(s)\n";
    return 1;
  }
  std::cerr << "ffi_test: all passed\n";
  return 0;
}
