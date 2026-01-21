#pragma once

#include "barretenberg/api/api.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/version.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <filesystem>
#include <iomanip>
#include <nlohmann/json.hpp>
#include <sstream>
#include <string>
#include <vector>

namespace bb {

/**
 * @brief Convert bytes to a hex string with 0x prefix
 */
inline std::string bytes_to_hex_string(const std::vector<uint8_t>& bytes)
{
    std::stringstream ss;
    ss << "0x" << std::hex << std::setfill('0');
    for (const auto& byte : bytes) {
        ss << std::setw(2) << static_cast<int>(byte);
    }
    return ss.str();
}

/**
 * @brief Serializable structure for JSON output (msgpack-compatible)
 */
struct JsonOutput {
    std::vector<std::string> fields;
    std::string vk_hash;   // Only for VK and proof (hash of VK the proof targets)
    std::string file_kind; // "vk", "proof", or "public_inputs"
    std::string bb_version;
    std::string scheme;
    std::string verifier_target; // Optional

    MSGPACK_FIELDS(fields, vk_hash, file_kind, bb_version, scheme, verifier_target);
};

/**
 * @brief Build JSON output string using msgpack serialization
 *
 * @tparam T Field element type (must have operator<< that outputs 0x-prefixed hex)
 * @param fields Vector of field elements to serialize
 * @param file_kind Type identifier: "vk", "proof", or "public_inputs"
 * @param flags API flags containing scheme and verifier_target
 * @param vk_hash Optional hash string for VK or proof files
 * @return JSON string
 */
template <typename T>
std::string build_json_output(const std::vector<T>& fields,
                              const std::string& file_kind,
                              const API::Flags& flags,
                              const std::string& vk_hash = "")
{
    std::vector<std::string> hex_fields;
    hex_fields.reserve(fields.size());
    for (const auto& field : fields) {
        std::stringstream ss;
        ss << field; // T's operator<< outputs "0x" prefix
        hex_fields.push_back(ss.str());
    }

    JsonOutput output{
        .fields = std::move(hex_fields),
        .vk_hash = vk_hash,
        .file_kind = file_kind,
        .bb_version = BB_VERSION,
        .scheme = flags.scheme,
        .verifier_target = flags.verifier_target,
    };

    msgpack::sbuffer buffer;
    msgpack::pack(buffer, output);
    msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());

    std::stringstream ss;
    ss << oh.get();
    return ss.str();
}

/**
 * @brief Check if file content appears to be JSON
 *
 * @details Detects JSON by checking if content starts with '{' (after skipping whitespace).
 * This is more robust than relying on file extension.
 */
inline bool is_json_content(const std::vector<uint8_t>& content)
{
    for (const auto& byte : content) {
        if (std::isspace(byte)) {
            continue;
        }
        return byte == '{';
    }
    return false;
}

/**
 * @brief Parse a hex string (with or without 0x prefix) to uint256_t
 */
inline uint256_t hex_string_to_uint256(const std::string& hex_str)
{
    std::string str = hex_str;
    // Remove 0x prefix if present
    if (str.size() >= 2 && str[0] == '0' && (str[1] == 'x' || str[1] == 'X')) {
        str = str.substr(2);
    }
    // Pad to 64 characters (32 bytes) if needed
    if (str.size() < 64) {
        str.insert(0, 64 - str.size(), '0');
    }
    return uint256_t(str);
}

/**
 * @brief Parse JSON file content and extract fields as uint256_t vector
 *
 * @param json_content Raw JSON string content
 * @return Vector of field elements
 */
inline std::vector<uint256_t> parse_json_fields(const std::string& json_content)
{
    auto json = nlohmann::json::parse(json_content);

    if (!json.contains("fields") || !json["fields"].is_array()) {
        throw_or_abort("JSON missing 'fields' array");
    }

    std::vector<uint256_t> result;
    result.reserve(json["fields"].size());
    for (const auto& field : json["fields"]) {
        result.push_back(hex_string_to_uint256(field.get<std::string>()));
    }
    return result;
}

/**
 * @brief Parse JSON file and extract the vk_hash field
 *
 * @param json_content Raw JSON string content
 * @return vk_hash as a hex string, or empty string if not present
 */
inline std::string parse_json_vk_hash(const std::string& json_content)
{
    auto json = nlohmann::json::parse(json_content);
    if (json.contains("vk_hash") && json["vk_hash"].is_string()) {
        return json["vk_hash"].get<std::string>();
    }
    return "";
}

/**
 * @brief Parse JSON file and extract fields as raw bytes
 *
 * @details Converts field elements back to their 32-byte big-endian representation.
 * This is the inverse of the serialization used for VK output.
 *
 * @param json_content Raw JSON string content
 * @return Vector of bytes (each field element is 32 bytes)
 */
inline std::vector<uint8_t> parse_json_fields_to_bytes(const std::string& json_content)
{
    auto fields = parse_json_fields(json_content);
    std::vector<uint8_t> result;
    result.reserve(fields.size() * 32);

    for (const auto& field : fields) {
        // Serialize each uint256_t as 32 bytes big-endian
        for (int i = 3; i >= 0; --i) {
            uint64_t limb = field.data[i];
            for (int j = 7; j >= 0; --j) {
                result.push_back(static_cast<uint8_t>((limb >> (j * 8)) & 0xFF));
            }
        }
    }
    return result;
}

} // namespace bb
