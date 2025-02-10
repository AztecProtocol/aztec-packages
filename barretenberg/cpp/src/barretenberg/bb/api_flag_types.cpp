#include "api_flag_types.hpp"
#include <cstddef>
#include <string>

namespace bb {
OracleHashType parse_oracle_hash_type(const std::string& s)
{
    if (s == "poseidon2") {
        return OracleHashType::POSEIDON2;
    } else if (s == "keccak") {
        return OracleHashType::KECCAK;
    } else {
        return OracleHashType::UNSPECIFIED;
    }
}

std::string to_string(OracleHashType type)
{
    switch (type) {
    case OracleHashType::POSEIDON2:
        return "POSEIDON2";
    case OracleHashType::KECCAK:
        return "KECCAK";
    default:
        return "UNSPECIFIED";
    }
}

OutputDataType parse_output_data_type(const std::string& s)
{
    if (s == "bytes") {
        return OutputDataType::BYTES;
    } else if (s == "fields") {
        return OutputDataType::FIELDS;
    } else if (s == "bytes_and_fields") {
        return OutputDataType::BYTES_AND_FIELDS;
    } else if (s == "fields_msgpack") {
        return OutputDataType::FIELDS_MSGPACK;
    } else {
        return OutputDataType::UNSPECIFIED;
    }
}

std::string to_string(OutputDataType type)
{
    switch (type) {
    case OutputDataType::BYTES:
        return "BYTES";
    case OutputDataType::FIELDS:
        return "FIELDS";
    case OutputDataType::BYTES_AND_FIELDS:
        return "BYTES_AND_FIELDS";
    case OutputDataType::FIELDS_MSGPACK:
        return "FIELDS_MSGPACK";
    default:
        return "UNSPECIFIED";
    }
}

InputType parse_input_type(const std::string& s)
{
    if (s == "single_circuit") {
        return InputType::SINGLE_CIRCUIT;
    } else if (s == "compiletime_stack") {
        return InputType::COMPILETIME_STACK;
    } else if (s == "runtime_stack") {
        return InputType::RUNTIME_STACK;
    } else {
        return InputType::UNSPECIFIED;
    }
}

std::string to_string(InputType type)
{
    switch (type) {
    case InputType::SINGLE_CIRCUIT:
        return "SINGLE_CIRCUIT";
    case InputType::COMPILETIME_STACK:
        return "COMPILETIME_STACK";
    case InputType::RUNTIME_STACK:
        return "RUNTIME_STACK";
    default:
        return "UNSPECIFIED";
    }
}

OutputContentType parse_output_content_type(const std::string& s)
{
    if (s == "proof") {
        return OutputContentType::PROOF;
    } else if (s == "vk") {
        return OutputContentType::VK;
    } else if (s == "proof_and_vk") {
        return OutputContentType::PROOF_AND_VK;
    } else {
        return OutputContentType::UNSPECIFIED;
    }
}

std::string to_string(OutputContentType type)
{
    switch (type) {
    case OutputContentType::PROOF:
        return "PROOF";
    case OutputContentType::VK:
        return "VK";
    case OutputContentType::PROOF_AND_VK:
        return "PROOF_AND_VK";
    default:
        return "UNSPECIFIED";
    }
}

} // namespace bb