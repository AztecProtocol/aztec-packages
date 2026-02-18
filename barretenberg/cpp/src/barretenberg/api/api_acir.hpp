#pragma once

#include <filesystem>

namespace bb {

/**
 * @brief Deserialize an ACIR program from bytecode (msgpack), re-serialize it, and write the
 * result to an output file as raw bytes (format marker + msgpack payload).
 *
 * Intended for internal roundtrip testing: the caller can then compare the output bytes with
 * the original to verify that C++ deserialization/serialization is lossless.
 *
 * @param bytecode_path  Path to the input bytecode (nargo JSON or raw gzip).
 * @param output_path    Path to write the roundtripped raw bytes.
 */
void acir_roundtrip(const std::filesystem::path& bytecode_path, const std::filesystem::path& output_path);

} // namespace bb
