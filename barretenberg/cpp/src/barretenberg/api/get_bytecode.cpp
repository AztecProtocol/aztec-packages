#include "get_bytecode.hpp"
#include <base64.h>
#include <fstream>
#include <libdeflate.h>
#include <nlohmann/json.hpp>
#include <stdexcept>

namespace {

std::vector<uint8_t> gzip_decompress(const std::vector<uint8_t>& compressed)
{
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
}
} // namespace

std::vector<uint8_t> get_bytecode_from_json(const std::string& jsonPath)
{
    std::ifstream jsonFile(jsonPath);
    if (!jsonFile.is_open()) {
        throw std::runtime_error("Failed to open JSON file: " + jsonPath);
    }

    nlohmann::json jsonData = nlohmann::json::parse(jsonFile);
    std::string base64Bytecode = jsonData["bytecode"];

    // Decode base64 and decompress using libdeflate for gzip
    std::string decoded = base64_decode(base64Bytecode, false);
    std::vector<uint8_t> gzipped(decoded.begin(), decoded.end());
    return gzip_decompress(gzipped);
}
