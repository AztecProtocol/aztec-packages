#pragma once

#include "barretenberg/api/api.hpp"
#include "barretenberg/common/version.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"
#include <iomanip>
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

} // namespace bb
