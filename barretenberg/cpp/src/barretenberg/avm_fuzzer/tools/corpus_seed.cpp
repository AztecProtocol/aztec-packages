/**
 * corpus_seed - Convert bytecode JSON files to fuzzer corpus entries
 *
 * Usage: corpus_seed <input.json> <corpus_dir> [--verbose] [--dry-run]
 *
 * Input JSON format:
 * {
 *   "bytecode": "0x...",      // Hex-encoded bytecode
 *   "calldata": ["0x...", ...]  // Optional hex-encoded field elements
 * }
 *
 * Output: Msgpack-serialized FuzzerData written to corpus_dir with content-hash filename
 */

#include "barretenberg/avm_fuzzer/fuzz_lib/bytecode_decompiler.hpp"
#include "barretenberg/avm_fuzzer/fuzz_lib/fuzzer_data.hpp"
#include "barretenberg/crypto/sha256/sha256.hpp"
#include "barretenberg/serialize/msgpack_impl.hpp"

#include <nlohmann/json.hpp>

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>

using json = nlohmann::json;
using bb::avm2::FF;

namespace {

/**
 * Parse hex string to bytes (with or without 0x prefix)
 */
std::vector<uint8_t> hex_to_bytes(const std::string& hex)
{
    std::string h = hex;
    // Remove 0x prefix if present
    if (h.size() >= 2 && h[0] == '0' && (h[1] == 'x' || h[1] == 'X')) {
        h = h.substr(2);
    }

    std::vector<uint8_t> bytes;
    bytes.reserve(h.size() / 2);

    for (size_t i = 0; i + 1 < h.size(); i += 2) {
        auto byte = static_cast<uint8_t>(std::stoul(h.substr(i, 2), nullptr, 16));
        bytes.push_back(byte);
    }

    return bytes;
}

/**
 * Convert bytes to hex string (for filename generation)
 */
std::string bytes_to_hex(const std::vector<uint8_t>& bytes)
{
    std::ostringstream ss;
    for (auto byte : bytes) {
        ss << std::hex << std::setfill('0') << std::setw(2) << static_cast<int>(byte);
    }
    return ss.str();
}

/**
 * Parse hex string to field element
 * Handles arbitrary length hex, pads to 32 bytes on the left
 */
FF hex_to_ff(const std::string& hex)
{
    auto bytes = hex_to_bytes(hex);

    // Pad to 32 bytes (big-endian, so pad on the left)
    while (bytes.size() < 32) {
        bytes.insert(bytes.begin(), 0);
    }

    // Truncate if too long (take the rightmost 32 bytes)
    if (bytes.size() > 32) {
        bytes = std::vector<uint8_t>(bytes.end() - 32, bytes.end());
    }

    return FF::serialize_from_buffer(bytes.data());
}

void print_usage()
{
    std::cerr << "Usage: corpus_seed <input.json> <corpus_dir> [--verbose] [--dry-run]\n\n"
              << "  input.json   - JSON file with bytecode and optional calldata\n"
              << "  corpus_dir   - Directory to write corpus entry\n\n"
              << "Options:\n"
              << "  --verbose    - Print decompiled instruction count\n"
              << "  --dry-run    - Parse and validate without writing\n\n"
              << "Input JSON format:\n"
              << "  {\n"
              << "    \"bytecode\": \"0x...\",\n"
              << "    \"calldata\": [\"0x...\", ...]\n"
              << "  }\n";
}

} // namespace

int main(int argc, char** argv)
{
    if (argc < 3) {
        print_usage();
        return 1;
    }

    std::string input_path = argv[1];
    std::string corpus_dir = argv[2];
    bool verbose = false;
    bool dry_run = false;

    // Parse optional flags
    for (int i = 3; i < argc; i++) {
        std::string arg = argv[i];
        if (arg == "--verbose" || arg == "-v") {
            verbose = true;
        } else if (arg == "--dry-run" || arg == "-n") {
            dry_run = true;
        } else {
            std::cerr << "Unknown option: " << arg << "\n";
            print_usage();
            return 1;
        }
    }

    // Read and parse JSON input
    std::ifstream input_file(input_path);
    if (!input_file) {
        std::cerr << "Error: Cannot open " << input_path << "\n";
        return 1;
    }

    json input_json;
    try {
        input_file >> input_json;
    } catch (const json::parse_error& e) {
        std::cerr << "Error: Failed to parse JSON: " << e.what() << "\n";
        return 1;
    }

    // Extract bytecode
    if (!input_json.contains("bytecode")) {
        std::cerr << "Error: JSON must contain 'bytecode' field\n";
        return 1;
    }

    std::vector<uint8_t> bytecode;
    try {
        bytecode = hex_to_bytes(input_json["bytecode"].get<std::string>());
    } catch (const std::exception& e) {
        std::cerr << "Error: Failed to parse bytecode: " << e.what() << "\n";
        return 1;
    }

    // Extract calldata (optional)
    std::vector<FF> calldata;
    if (input_json.contains("calldata")) {
        try {
            for (const auto& cd : input_json["calldata"]) {
                calldata.push_back(hex_to_ff(cd.get<std::string>()));
            }
        } catch (const std::exception& e) {
            std::cerr << "Error: Failed to parse calldata: " << e.what() << "\n";
            return 1;
        }
    }

    // Print bytecode for debugging
    if (verbose) {
        std::cout << "Bytecode (" << bytecode.size() << " bytes): ";
        for (size_t i = 0; i < std::min(bytecode.size(), size_t(32)); ++i) {
            std::cout << std::hex << std::setfill('0') << std::setw(2) << static_cast<int>(bytecode[i]);
        }
        if (bytecode.size() > 32) {
            std::cout << "...";
        }
        std::cout << std::dec << "\n";
    }

    // Decompile bytecode to FuzzerData
    FuzzerData fuzzer_data;
    try {
        fuzzer_data = bb::avm_fuzzer::decompile_bytecode(bytecode, calldata);
    } catch (const std::exception& e) {
        std::cerr << "Error: Failed to decompile bytecode: " << e.what() << "\n";
        return 1;
    }

    if (verbose) {
        size_t instr_count = 0;
        for (const auto& block : fuzzer_data.instruction_blocks) {
            instr_count += block.size();
        }
        std::cout << "Decompiled " << instr_count << " instructions from " << bytecode.size() << " bytes\n";
        std::cout << "Calldata: " << calldata.size() << " elements\n";
    }

    if (dry_run) {
        std::cout << "Dry run - not writing output\n";
        return 0;
    }

    // Serialize to msgpack
    msgpack::sbuffer buffer;
    msgpack::pack(buffer, fuzzer_data);

    // Ensure corpus directory exists
    std::filesystem::create_directories(corpus_dir);

    // Generate filename from content hash (first 16 bytes of SHA256)
    auto hash = bb::crypto::sha256(std::vector<uint8_t>(buffer.data(), buffer.data() + buffer.size()));
    std::string filename = bytes_to_hex(std::vector<uint8_t>(hash.begin(), hash.begin() + 16));
    std::string output_path = corpus_dir + "/" + filename;

    // Write output
    std::ofstream output_file(output_path, std::ios::binary);
    if (!output_file) {
        std::cerr << "Error: Cannot write to " << output_path << "\n";
        return 1;
    }

    output_file.write(buffer.data(), static_cast<std::streamsize>(buffer.size()));
    output_file.close();

    std::cout << "Written: " << output_path << "\n";
    return 0;
}
