#include "generated/echo_types.hpp"
#include "generated/ipc_codegen/named_union.hpp"
#include "generated/ipc_codegen/schema.hpp"

#include <array>
#include <cctype>
#include <cstdint>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

namespace echo_reflect {

struct MerkleTreeId {
  void msgpack_schema(auto &packer) const {
    packer.pack_alias("MerkleTreeId", "unsigned int");
  }
};

struct Fr {
  void msgpack_schema(auto &packer) const { packer.pack_alias("Fr", "bin32"); }
};

struct EchoInner {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoInner";
  std::vector<std::vector<uint8_t>> values;
  std::optional<bool> flag;
  SERIALIZATION_FIELDS(values, flag)
};

struct EchoBytes {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoBytes";
  std::vector<uint8_t> data;
  SERIALIZATION_FIELDS(data)
};

struct EchoFields {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoFields";
  uint32_t a;
  uint64_t b;
  std::string name;
  SERIALIZATION_FIELDS(a, b, name)
};

struct EchoNested {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoNested";
  EchoInner inner;
  SERIALIZATION_FIELDS(inner)
};

struct EchoAliases {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoAliases";
  MerkleTreeId treeId;
  Fr hash;
  std::optional<Fr> maybeHash;
  std::vector<Fr> hashes;
  SERIALIZATION_FIELDS(treeId, hash, maybeHash, hashes)
};

struct EchoShutdown {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoShutdown";
  template <typename PackFn> void msgpack(PackFn &&pack_fn) { pack_fn(); }
};

struct EchoBytesResponse {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoBytesResponse";
  std::vector<uint8_t> data;
  SERIALIZATION_FIELDS(data)
};

struct EchoFieldsResponse {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoFieldsResponse";
  uint32_t a;
  uint64_t b;
  std::string name;
  SERIALIZATION_FIELDS(a, b, name)
};

struct EchoNestedResponse {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoNestedResponse";
  EchoInner inner;
  SERIALIZATION_FIELDS(inner)
};

struct EchoAliasesResponse {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoAliasesResponse";
  MerkleTreeId treeId;
  Fr hash;
  std::optional<Fr> maybeHash;
  std::vector<Fr> hashes;
  SERIALIZATION_FIELDS(treeId, hash, maybeHash, hashes)
};

struct EchoShutdownResponse {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoShutdownResponse";
  template <typename PackFn> void msgpack(PackFn &&pack_fn) { pack_fn(); }
};

struct EchoErrorResponse {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "EchoErrorResponse";
  std::string message;
  SERIALIZATION_FIELDS(message)
};

using Command = ipc::NamedUnion<EchoBytes, EchoFields, EchoNested, EchoAliases,
                                EchoShutdown>;
using Response = ipc::NamedUnion<EchoBytesResponse, EchoFieldsResponse,
                                 EchoNestedResponse, EchoAliasesResponse,
                                 EchoShutdownResponse, EchoErrorResponse>;

struct EchoSchema {
  void msgpack_schema(auto &packer) const {
    packer.pack_map(2);
    packer.pack("commands");
    packer.pack_schema(Command{});
    packer.pack("responses");
    packer.pack_schema(Response{});
  }
};

std::string strip_whitespace(std::string value) {
  std::string stripped;
  stripped.reserve(value.size());
  for (unsigned char c : value) {
    if (!std::isspace(c)) {
      stripped.push_back(static_cast<char>(c));
    }
  }
  return stripped;
}

} // namespace echo_reflect

int main(int argc, char **argv) {
  if (argc != 3 || std::string(argv[1]) != "--schema") {
    std::cerr << "Usage: schema_reflection_test --schema <schema.json>\n";
    return 1;
  }

  std::ifstream schema_file(argv[2]);
  if (!schema_file) {
    std::cerr << "Failed to open schema: " << argv[2] << "\n";
    return 1;
  }
  std::stringstream buffer;
  buffer << schema_file.rdbuf();

  auto reflected = ipc::msgpack_schema_to_string(echo_reflect::EchoSchema{});
  if (echo_reflect::strip_whitespace(reflected) !=
      echo_reflect::strip_whitespace(buffer.str())) {
    std::cerr << "Reflected schema does not match committed echo schema\n";
    std::cerr << "Reflected:\n" << reflected << "\n";
    return 1;
  }

  std::cerr << "schema_reflection_test(cpp): schema roundtrip OK\n";
  return 0;
}
