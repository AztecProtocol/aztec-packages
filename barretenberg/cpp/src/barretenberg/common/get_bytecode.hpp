#pragma once
#include <filesystem>
#include <iostream>
#include <iterator>
#include <string>
#include <vector>

// Parse JSON file and extract base64-encoded gzipped bytecode
std::vector<uint8_t> get_bytecode_from_json(const std::string& json_path);

// Decode base64-encoded gzipped bytecode string
std::vector<uint8_t> decode_bytecode(const std::string& base64_bytecode);

// Decompress gzipped file using libdeflate
std::vector<uint8_t> gunzip(const std::string& path);

// Get bytecode from various file formats
std::vector<uint8_t> get_bytecode(const std::string& bytecode_path);

#ifdef _WIN32
// Overload accepting std::filesystem::path (implicit conversion path->string is
// deleted on MinGW/libstdc++).
inline std::vector<uint8_t> get_bytecode(const std::filesystem::path& bytecode_path)
{
    return get_bytecode(bytecode_path.string());
}
#endif
