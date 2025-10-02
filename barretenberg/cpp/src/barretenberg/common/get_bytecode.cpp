#include "get_bytecode.hpp"
#include "barretenberg/common/throw_or_abort.hpp"
#include "base64.hpp"
#include <string>
#include <vector>

#ifndef __wasm__
#include <fstream>
#include <libdeflate.h>
#include <nlohmann/json.hpp>
#include <stdexcept>
#endif

namespace {

std::vector<uint8_t> gzip_decompress([[maybe_unused]] const std::vector<uint8_t>& compressed)
{
#ifdef __wasm__
    throw_or_abort("gzip_decompress not supported in WASM");
#else
    std::vector<uint8_t> decompressed;
    decompressed.resize(1024ULL * 128ULL); // Initial size guess

    for (;;) {
        auto decompressor = std::unique_ptr<libdeflate_decompressor, void (*)(libdeflate_decompressor*)>{
            libdeflate_alloc_decompressor(), libdeflate_free_decompressor
        };
        size_t actual_size = 0;
        libdeflate_result result = libdeflate_gzip_decompress(decompressor.get(),
                                                              compressed.data(),
                                                              compressed.size(),
                                                              decompressed.data(),
                                                              decompressed.size(),
                                                              &actual_size);

        if (result == LIBDEFLATE_INSUFFICIENT_SPACE) {
            decompressed.resize(decompressed.size() * 2);
            continue;
        }
        if (result == LIBDEFLATE_BAD_DATA) {
            throw std::runtime_error("Invalid gzip data");
        }
        decompressed.resize(actual_size);
        break;
    }
    return decompressed;
#endif
}
} // namespace

std::vector<uint8_t> decode_bytecode(const std::string& base64_bytecode)
{
    // Decode base64 and decompress using libdeflate for gzip
    std::string decoded = base64_decode(base64_bytecode, false);
    std::vector<uint8_t> gzipped(decoded.begin(), decoded.end());
    return gzip_decompress(gzipped);
}

std::vector<uint8_t> get_bytecode_from_json([[maybe_unused]] const std::string& json_path)
{
#ifdef __wasm__
    throw_or_abort("get_bytecode_from_json not supported in WASM");
#else
    std::ifstream json_file(json_path);
    if (!json_file.is_open()) {
        throw std::runtime_error("Failed to open JSON file: " + json_path);
    }

    nlohmann::json json_data = nlohmann::json::parse(json_file);
    std::string base64_bytecode = json_data["bytecode"];

    return decode_bytecode(base64_bytecode);
#endif
}

std::vector<uint8_t> gunzip([[maybe_unused]] const std::string& path)
{
#ifdef __wasm__
    throw_or_abort("gunzip not supported in WASM");
#else
    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) {
        throw std::runtime_error("Failed to open file: " + path);
    }

    std::vector<uint8_t> compressed((std::istreambuf_iterator<char>(file)), std::istreambuf_iterator<char>());
    return gzip_decompress(compressed);
#endif
}

std::vector<uint8_t> get_bytecode([[maybe_unused]] const std::string& bytecodePath)
{
#ifdef __wasm__
    throw_or_abort("get_bytecode not supported in WASM");
#else
    if (bytecodePath == "-") {
        return { (std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>() };
    }
    std::filesystem::path filePath = bytecodePath;
    if (filePath.extension() == ".json") {
        // Try reading json files as if they are a Nargo build artifact
        return get_bytecode_from_json(bytecodePath);
    }

    // For other extensions, assume file is a raw ACIR program
    return gunzip(bytecodePath);
#endif
}
