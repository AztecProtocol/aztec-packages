// Golden file wire-format conformance test (C++).
// For each golden file, asserts:
//   1. We can decode the bytes into the expected typed wire value.
//   2. Re-encoding the same value with the request/response framing produces
//      byte-identical output.
// The combination pins down the wire format as a binding contract.
//
// Usage: golden_test --golden-dir <path>

#include "generated/echo_dispatch.hpp"

#include <array>
#include <cstdint>
#include <cstring>
#include <fstream>
#include <iostream>
#include <iterator>
#include <optional>
#include <string>
#include <vector>

namespace {

int g_pass = 0;
int g_fail = 0;

std::vector<uint8_t> read_file(const std::string &path) {
  std::ifstream in(path, std::ios::binary);
  if (!in) {
    THROW std::runtime_error("cannot open " + path);
  }
  return std::vector<uint8_t>(std::istreambuf_iterator<char>(in),
                              std::istreambuf_iterator<char>());
}

void report(const std::string &file, const std::string &error) {
  if (error.empty()) {
    std::cerr << "  PASS: " << file << "\n";
    g_pass++;
  } else {
    std::cerr << "  FAIL: " << file << ": " << error << "\n";
    g_fail++;
  }
}

bool bytes_equal(const msgpack::sbuffer &buf,
                 const std::vector<uint8_t> &golden) {
  return buf.size() == golden.size() &&
         std::memcmp(buf.data(), golden.data(), golden.size()) == 0;
}

template <typename T> bool equals(const T &a, const T &b) { return a == b; }

bool equals(const echo::wire::EchoAliases &a,
            const echo::wire::EchoAliases &b) {
  return a == b;
}

bool equals(const echo::wire::EchoAliasesResponse &a,
            const echo::wire::EchoAliasesResponse &b) {
  return a == b;
}

// Requests are framed as [[name, payload-map]].
template <typename T>
void check_request(const std::string &dir, const std::string &file,
                   const std::string &name, const T &expected) {
  try {
    auto golden = read_file(dir + "/" + file);
    auto unpacked = msgpack::unpack(
        reinterpret_cast<const char *>(golden.data()), golden.size());
    auto obj = unpacked.get();
    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 1) {
      report(file, "expected outer array of size 1");
      return;
    }
    auto &inner = obj.via.array.ptr[0];
    if (inner.type != msgpack::type::ARRAY || inner.via.array.size != 2 ||
        inner.via.array.ptr[0].type != msgpack::type::STR) {
      report(file, "expected [CommandName, payload]");
      return;
    }
    std::string got_name(inner.via.array.ptr[0].via.str.ptr,
                         inner.via.array.ptr[0].via.str.size);
    if (got_name != name) {
      report(file, "wrong command name: " + got_name);
      return;
    }
    T value;
    inner.via.array.ptr[1].convert(value);
    if (!equals(value, expected)) {
      report(file, "decoded value mismatch");
      return;
    }
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(1);
    pk.pack_array(2);
    pk.pack(name);
    pk.pack(value);
    if (!bytes_equal(buf, golden)) {
      report(file, "roundtrip byte mismatch (" + std::to_string(buf.size()) +
                       " vs " + std::to_string(golden.size()) + " bytes)");
      return;
    }
    report(file, "");
  } catch (const std::exception &e) {
    report(file, e.what());
  }
}

// Responses are framed as [name, payload-map].
template <typename T>
void check_response(const std::string &dir, const std::string &file,
                    const std::string &name, const T &expected) {
  try {
    auto golden = read_file(dir + "/" + file);
    auto unpacked = msgpack::unpack(
        reinterpret_cast<const char *>(golden.data()), golden.size());
    auto obj = unpacked.get();
    if (obj.type != msgpack::type::ARRAY || obj.via.array.size != 2 ||
        obj.via.array.ptr[0].type != msgpack::type::STR) {
      report(file, "expected [ResponseName, payload]");
      return;
    }
    std::string got_name(obj.via.array.ptr[0].via.str.ptr,
                         obj.via.array.ptr[0].via.str.size);
    if (got_name != name) {
      report(file, "wrong response name: " + got_name);
      return;
    }
    T value;
    obj.via.array.ptr[1].convert(value);
    if (!equals(value, expected)) {
      report(file, "decoded value mismatch");
      return;
    }
    msgpack::sbuffer buf;
    msgpack::packer<msgpack::sbuffer> pk(buf);
    pk.pack_array(2);
    pk.pack(name);
    pk.pack(value);
    if (!bytes_equal(buf, golden)) {
      report(file, "roundtrip byte mismatch (" + std::to_string(buf.size()) +
                       " vs " + std::to_string(golden.size()) + " bytes)");
      return;
    }
    report(file, "");
  } catch (const std::exception &e) {
    report(file, e.what());
  }
}

echo::wire::Fr test_hash(uint8_t base) {
  std::array<uint8_t, 32> bytes{};
  for (size_t i = 0; i < bytes.size(); i++) {
    bytes[i] = static_cast<uint8_t>(base + i);
  }
  return echo::wire::Fr(bytes);
}

} // namespace

int main(int argc, char **argv) {
  std::string dir;
  for (int i = 1; i + 1 < argc; i++) {
    if (std::string(argv[i]) == "--golden-dir") {
      dir = argv[i + 1];
    }
  }
  if (dir.empty()) {
    std::cerr << "Usage: golden_test --golden-dir <path>\n";
    return 1;
  }

  using namespace echo::wire;

  const std::vector<uint8_t> bytes_payload = {0xDE, 0xAD, 0xBE, 0xEF, 0x42};
  const EchoInner nested_inner{{{1, 2, 3}, {4, 5}}, true};
  const auto hash = test_hash(0x10);
  const auto second = test_hash(0x40);

  // ============ Original happy-path cases ============

  check_request(dir, "echo_bytes_request.msgpack", "EchoBytes",
                EchoBytes{bytes_payload});
  check_request(dir, "echo_fields_request.msgpack", "EchoFields",
                EchoFields{42, 999999, "hello wire compat"});
  check_request(dir, "echo_nested_request.msgpack", "EchoNested",
                EchoNested{nested_inner});
  check_request(dir, "echo_aliases_request.msgpack", "EchoAliases",
                EchoAliases{7, hash, second, {hash, second}});

  check_response(dir, "echo_bytes_response.msgpack", "EchoBytesResponse",
                 EchoBytesResponse{bytes_payload});
  check_response(dir, "echo_fields_response.msgpack", "EchoFieldsResponse",
                 EchoFieldsResponse{42, 999999, "hello wire compat"});
  check_response(dir, "echo_nested_response.msgpack", "EchoNestedResponse",
                 EchoNestedResponse{nested_inner});
  check_response(dir, "echo_aliases_response.msgpack", "EchoAliasesResponse",
                 EchoAliasesResponse{7, hash, second, {hash, second}});

  // ============ Boundary cases ============

  check_request(dir, "echo_bytes_empty.msgpack", "EchoBytes", EchoBytes{{}});
  check_request(dir, "echo_bytes_bin16.msgpack", "EchoBytes",
                EchoBytes{std::vector<uint8_t>(256, 0xAA)});
  check_request(dir, "echo_fields_max.msgpack", "EchoFields",
                EchoFields{UINT32_MAX, UINT64_MAX, ""});
  check_request(dir, "echo_fields_uint_boundary.msgpack", "EchoFields",
                EchoFields{128, uint64_t(UINT32_MAX) + 1, "x"});
  check_request(dir, "echo_fields_unicode.msgpack", "EchoFields",
                EchoFields{0, 0, "héllo τέστ 🚀 mañana"});
  check_request(dir, "echo_fields_str16.msgpack", "EchoFields",
                EchoFields{0, 0, std::string(300, 'a')});
  check_request(dir, "echo_nested_flag_none.msgpack", "EchoNested",
                EchoNested{EchoInner{{}, std::nullopt}});
  check_request(
      dir, "echo_nested_flag_false.msgpack", "EchoNested",
      EchoNested{EchoInner{std::vector<std::vector<uint8_t>>{{}}, false}});

  // ============ Blob / fail / error cases ============

  const std::array<std::vector<uint8_t>, 2> blob_parts = {
      std::vector<uint8_t>{1, 2, 3}, std::vector<uint8_t>{4}};
  const std::array<std::vector<uint8_t>, 2> blob_parts_none = {
      std::vector<uint8_t>{}, std::vector<uint8_t>{9}};

  check_request(dir, "echo_blobs_request.msgpack", "EchoBlobs",
                EchoBlobs{std::vector<uint8_t>{0xAA, 0xBB}, blob_parts});
  check_request(dir, "echo_blobs_none.msgpack", "EchoBlobs",
                EchoBlobs{std::nullopt, blob_parts_none});
  check_response(
      dir, "echo_blobs_response.msgpack", "EchoBlobsResponse",
      EchoBlobsResponse{std::vector<uint8_t>{0xAA, 0xBB}, blob_parts});
  check_request(dir, "echo_fail_request.msgpack", "EchoFail",
                EchoFail{"deliberate failure"});
  check_response(dir, "echo_fail_response.msgpack", "EchoFailResponse",
                 EchoFailResponse{});
  check_response(dir, "echo_error_response.msgpack", "EchoErrorResponse",
                 EchoErrorResponse{"deliberate failure"});

  std::cerr << "\nResults: " << g_pass << "/" << (g_pass + g_fail)
            << " passed, " << g_fail << " failed\n";
  return g_fail > 0 ? 1 : 0;
}
