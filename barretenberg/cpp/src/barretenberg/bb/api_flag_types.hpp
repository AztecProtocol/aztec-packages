#pragma once
#include <cstddef>
#include <string>

namespace bb {
enum class OracleHashType : size_t { UNSPECIFIED, POSEIDON2, KECCAK };
OracleHashType parse_oracle_hash_type(const std::string& s);
std::string to_string(OracleHashType type);

enum class OutputDataType : size_t { UNSPECIFIED, BYTES, FIELDS, BYTES_AND_FIELDS, FIELDS_MSGPACK };
OutputDataType parse_output_data_type(const std::string& s);
std::string to_string(OutputDataType type);

enum class InputType : size_t { UNSPECIFIED, SINGLE_CIRCUIT, COMPILETIME_STACK, RUNTIME_STACK };
InputType parse_input_type(const std::string& s);
std::string to_string(InputType type);

enum class OutputContentType : size_t { UNSPECIFIED, PROOF, VK, PROOF_AND_VK };
OutputContentType parse_output_content_type(const std::string& s);
std::string to_string(OutputContentType type);
} // namespace bb