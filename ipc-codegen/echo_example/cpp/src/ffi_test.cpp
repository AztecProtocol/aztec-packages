// In-process FFI conformance test (C++): drives the generated
// echo_ipc_ffi_entry with wire requests and checks the responses — a round
// trip, the error frame for a failing command, and the error frame for
// malformed input.
//
// Usage: ffi_test

#include "generated/echo_ffi.hpp"

#include <cstdint>
#include <iostream>
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

// [[name, payload]] — a named-union pair inside the one-element argument array.
template <typename Cmd>
std::vector<uint8_t> pack_request(const char *name, const Cmd &cmd) {
  msgpack::sbuffer buf;
  msgpack::packer<msgpack::sbuffer> pk(buf);
  pk.pack_array(1);
  pk.pack_array(2);
  pk.pack(std::string(name));
  pk.pack(cmd);
  return std::vector<uint8_t>(buf.data(), buf.data() + buf.size());
}

// Hand the request over the way a foreign caller does: in a buffer from
// echo_ipc_ffi_alloc, receiving the response in one it frees with
// echo_ipc_ffi_free.
std::vector<uint8_t> call(const std::vector<uint8_t> &request) {
  auto *in = static_cast<uint8_t *>(echo_ipc_ffi_alloc(request.size()));
  std::copy(request.begin(), request.end(), in);
  uint8_t *out = nullptr;
  size_t out_len = 0;
  echo_ipc_ffi_entry(in, request.size(), &out, &out_len);
  echo_ipc_ffi_free(in);
  std::vector<uint8_t> response(out, out + out_len);
  echo_ipc_ffi_free(out);
  return response;
}

struct Response {
  std::string type;
  msgpack::object_handle handle;
  msgpack::object payload;
};

Response decode(const std::vector<uint8_t> &bytes) {
  Response r;
  r.handle = msgpack::unpack(reinterpret_cast<const char *>(bytes.data()),
                             bytes.size());
  auto obj = r.handle.get();
  if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2) {
    throw std::runtime_error("response is not a [name, payload] pair");
  }
  r.type = obj.via.array.ptr[0].as<std::string>();
  r.payload = obj.via.array.ptr[1];
  return r;
}

std::string error_message(const msgpack::object &payload) {
  std::map<std::string, std::string> fields;
  payload.convert(fields);
  return fields["message"];
}

} // namespace

int main() {
  {
    echo::wire::EchoBytes cmd{.data = {0xde, 0xad, 0xbe, 0xef, 0x42}};
    auto response = decode(call(pack_request("EchoBytes", cmd)));
    echo::wire::EchoBytesResponse decoded;
    response.payload.convert(decoded);
    check(response.type == "EchoBytesResponse" && decoded.data == cmd.data,
          "EchoBytes round trip");
  }
  {
    echo::wire::EchoFields cmd{.a = 42, .b = 999999, .name = "hello ffi"};
    auto response = decode(call(pack_request("EchoFields", cmd)));
    echo::wire::EchoFieldsResponse decoded;
    response.payload.convert(decoded);
    check(response.type == "EchoFieldsResponse" && decoded.a == 42 &&
              decoded.b == 999999 && decoded.name == "hello ffi",
          "EchoFields round trip");
  }
  {
    echo::wire::EchoFail cmd{.message = "boom"};
    auto response = decode(call(pack_request("EchoFail", cmd)));
    check(response.type == "EchoErrorResponse" &&
              error_message(response.payload) == "boom",
          "EchoFail becomes an error frame carrying the message");
  }
  {
    auto response = decode(call(pack_request("NoSuchCommand", 0)));
    check(response.type == "EchoErrorResponse" &&
              error_message(response.payload).find("unknown command") !=
                  std::string::npos,
          "unknown command becomes an error frame");
  }

  if (g_fail > 0) {
    std::cerr << "ffi_test: " << g_fail << " failure(s)\n";
    return 1;
  }
  std::cerr << "ffi_test: all passed\n";
  return 0;
}
