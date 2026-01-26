#pragma once

#include "barretenberg/api/api.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "barretenberg/common/version.hpp"
#include "barretenberg/numeric/uint256/uint256.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <iomanip>
#include <sstream>
#include <string>
#include <vector>

#ifndef __wasm__
#include <nlohmann/json.hpp>
#include <optional>
#endif

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

#ifndef __wasm__
/**
 * @brief Try to parse file content as JSON
 *
 * @details Attempts to parse the content as JSON.
 * Returns nullopt if parsing fails, allowing fallback to binary format.
 */
inline std::optional<nlohmann::json> try_parse_json(const std::vector<uint8_t>& content)
{
    // Quick check: JSON objects must start with '{' (after whitespace)
    for (const auto& byte : content) {
        if (std::isspace(static_cast<unsigned char>(byte)) != 0) {
            continue;
        }
        if (byte != '{') {
            return std::nullopt;
        }
        break;
    }

    // Try to parse as JSON
    try {
        std::string str(content.begin(), content.end());
        return nlohmann::json::parse(str);
    } catch (...) {
        return std::nullopt;
    }
}
#endif

#ifndef __wasm__
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
#endif

/**
 * @brief Serializable structure for VK JSON output (msgpack-compatible)
 */
struct VkJson {
    std::vector<std::string> vk;
    std::string hash;
    std::string bb_version;
    std::string scheme;

    MSGPACK_FIELDS(vk, hash, bb_version, scheme);

    template <typename T>
    static std::string build(const std::vector<T>& fields, const std::string& hash, const std::string& scheme)
    {
        std::vector<std::string> hex_fields;
        hex_fields.reserve(fields.size());
        for (const auto& field : fields) {
            std::stringstream ss;
            ss << field;
            hex_fields.push_back(ss.str());
        }

        VkJson output{ .vk = std::move(hex_fields), .hash = hash, .bb_version = BB_VERSION, .scheme = scheme };

        msgpack::sbuffer buffer;
        msgpack::pack(buffer, output);
        msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());

        std::stringstream ss;
        ss << oh.get();
        return ss.str();
    }

#ifndef __wasm__
    static std::vector<uint8_t> parse_to_bytes(const nlohmann::json& json)
    {
        if (!json.contains("vk") || !json["vk"].is_array()) {
            throw_or_abort("JSON missing 'vk' array");
        }
        std::vector<uint8_t> result;
        result.reserve(json["vk"].size() * 32);
        for (const auto& field : json["vk"]) {
            auto value = hex_string_to_uint256(field.get<std::string>());
            for (int i = 3; i >= 0; --i) {
                uint64_t limb = value.data[i];
                for (int j = 7; j >= 0; --j) {
                    result.push_back(static_cast<uint8_t>((limb >> (j * 8)) & 0xFF));
                }
            }
        }
        return result;
    }
#endif
};

/**
 * @brief Serializable structure for proof JSON output (msgpack-compatible)
 */
struct ProofJson {
    std::vector<std::string> proof;
    std::string vk_hash;
    std::string bb_version;
    std::string scheme;

    MSGPACK_FIELDS(proof, vk_hash, bb_version, scheme);

    template <typename T>
    static std::string build(const std::vector<T>& fields, const std::string& vk_hash, const std::string& scheme)
    {
        std::vector<std::string> hex_fields;
        hex_fields.reserve(fields.size());
        for (const auto& field : fields) {
            std::stringstream ss;
            ss << field;
            hex_fields.push_back(ss.str());
        }

        ProofJson output{
            .proof = std::move(hex_fields), .vk_hash = vk_hash, .bb_version = BB_VERSION, .scheme = scheme
        };

        msgpack::sbuffer buffer;
        msgpack::pack(buffer, output);
        msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());

        std::stringstream ss;
        ss << oh.get();
        return ss.str();
    }

#ifndef __wasm__
    static std::vector<uint256_t> parse(const nlohmann::json& json)
    {
        if (!json.contains("proof") || !json["proof"].is_array()) {
            throw_or_abort("JSON missing 'proof' array");
        }
        std::vector<uint256_t> result;
        result.reserve(json["proof"].size());
        for (const auto& field : json["proof"]) {
            result.push_back(hex_string_to_uint256(field.get<std::string>()));
        }
        return result;
    }
#endif
};

/**
 * @brief Serializable structure for public inputs JSON output (msgpack-compatible)
 */
struct PublicInputsJson {
    std::vector<std::string> public_inputs;
    std::string bb_version;
    std::string scheme;

    MSGPACK_FIELDS(public_inputs, bb_version, scheme);

    template <typename T> static std::string build(const std::vector<T>& fields, const std::string& scheme)
    {
        std::vector<std::string> hex_fields;
        hex_fields.reserve(fields.size());
        for (const auto& field : fields) {
            std::stringstream ss;
            ss << field;
            hex_fields.push_back(ss.str());
        }

        PublicInputsJson output{ .public_inputs = std::move(hex_fields), .bb_version = BB_VERSION, .scheme = scheme };

        msgpack::sbuffer buffer;
        msgpack::pack(buffer, output);
        msgpack::object_handle oh = msgpack::unpack(buffer.data(), buffer.size());

        std::stringstream ss;
        ss << oh.get();
        return ss.str();
    }

#ifndef __wasm__
    static std::vector<uint256_t> parse(const nlohmann::json& json)
    {
        if (!json.contains("public_inputs") || !json["public_inputs"].is_array()) {
            throw_or_abort("JSON missing 'public_inputs' array");
        }
        std::vector<uint256_t> result;
        result.reserve(json["public_inputs"].size());
        for (const auto& field : json["public_inputs"]) {
            result.push_back(hex_string_to_uint256(field.get<std::string>()));
        }
        return result;
    }
#endif
};

} // namespace bb
