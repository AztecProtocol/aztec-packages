// Verifies the schema -> generated types -> reflected schema round trip is
// the identity. This is what makes the edit-code/extract-schema/commit
// workflow safe: reflecting the GENERATED wire types must reproduce the
// committed schema byte-for-byte (modulo whitespace). A hand-maintained copy
// of the types would mask generator drift (and did: it hid a union-ordering
// bug), so the generated header is reflected directly.

#include "generated/echo_dispatch.hpp"
#include "generated/ipc_codegen/schema.hpp"

#include <cctype>
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>

namespace {

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

// Machinery self-check independent of codegen: a hand-declared struct must
// reflect to the expected JSON.
struct ReflectProbe {
  static constexpr const char MSGPACK_SCHEMA_NAME[] = "ReflectProbe";
  uint32_t value;
  IPC_CODEGEN_SERIALIZATION_FIELDS(value)
};

bool machinery_self_check() {
  auto reflected = ipc::msgpack_schema_to_string(ReflectProbe{});
  auto expected = R"({"__typename": "ReflectProbe", "value": "unsigned int"})";
  if (strip_whitespace(reflected) != strip_whitespace(expected)) {
    std::cerr << "Reflection machinery self-check failed.\nGot: " << reflected
              << "\nExpected: " << expected << "\n";
    return false;
  }
  return true;
}

} // namespace

int main(int argc, char **argv) {
  if (argc != 3 || std::string(argv[1]) != "--schema") {
    std::cerr << "Usage: schema_reflection_test --schema <schema.json>\n";
    return 1;
  }

  if (!machinery_self_check()) {
    return 1;
  }

  std::ifstream schema_file(argv[2]);
  if (!schema_file) {
    std::cerr << "Failed to open schema: " << argv[2] << "\n";
    return 1;
  }
  std::stringstream buffer;
  buffer << schema_file.rdbuf();

  auto reflected = echo::get_echo_schema_as_json();
  if (strip_whitespace(reflected) != strip_whitespace(buffer.str())) {
    std::cerr << "Reflected schema from GENERATED types does not match the "
                 "committed echo schema\n";
    std::cerr << "Reflected:\n" << reflected << "\n";
    return 1;
  }

  std::cerr << "schema_reflection_test(cpp): generated-type roundtrip OK\n";
  return 0;
}
