#include "barretenberg/wsdb/wsdb_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/parent_monitor.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_server.hpp"
#include "barretenberg/wsdb/wsdb_execute.hpp"

#include <atomic>
#include <csignal>
#include <cstdint>
#include <iostream>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include <sstream>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// ---------------------------------------------------------------------------
// Simple JSON-like parsing for config maps
// Parses "{0:1024,1:2048,...}" into unordered_map<uint32_t, uint64_t>
// ---------------------------------------------------------------------------

static std::unordered_map<MerkleTreeId, uint64_t> parse_tree_uint64_map(const std::string& json)
{
    std::unordered_map<MerkleTreeId, uint64_t> result;
    if (json.empty()) {
        return result;
    }
    std::string cleaned;
    for (char c : json) {
        if (c != '{' && c != '}' && c != ' ') {
            cleaned += c;
        }
    }
    std::istringstream ss(cleaned);
    std::string pair;
    while (std::getline(ss, pair, ',')) {
        auto colon_pos = pair.find(':');
        if (colon_pos != std::string::npos) {
            auto key = static_cast<MerkleTreeId>(std::stoi(pair.substr(0, colon_pos)));
            auto value = static_cast<uint64_t>(std::stoull(pair.substr(colon_pos + 1)));
            result[key] = value;
        }
    }
    return result;
}

static std::unordered_map<MerkleTreeId, uint32_t> parse_tree_uint32_map(const std::string& json)
{
    std::unordered_map<MerkleTreeId, uint32_t> result;
    if (json.empty()) {
        return result;
    }
    auto u64_map = parse_tree_uint64_map(json);
    for (const auto& [k, v] : u64_map) {
        result[k] = static_cast<uint32_t>(v);
    }
    return result;
}

static std::unordered_map<MerkleTreeId, index_t> parse_tree_index_map(const std::string& json)
{
    std::unordered_map<MerkleTreeId, index_t> result;
    if (json.empty()) {
        return result;
    }
    auto u64_map = parse_tree_uint64_map(json);
    for (const auto& [k, v] : u64_map) {
        result[k] = static_cast<index_t>(v);
    }
    return result;
}

// ---------------------------------------------------------------------------
// Parse prefilled public data from JSON: [["slot_hex","value_hex"],...]
// Each hex string is a 64-char (32-byte) hex-encoded field element.
// ---------------------------------------------------------------------------

static fr hex_to_fr(const std::string& hex)
{
    std::string cleaned = hex;
    if (cleaned.size() >= 2 && cleaned[0] == '0' && (cleaned[1] == 'x' || cleaned[1] == 'X')) {
        cleaned = cleaned.substr(2);
    }
    return fr(cleaned);
}

static std::vector<PublicDataLeafValue> parse_prefilled_public_data(const std::string& json)
{
    std::vector<PublicDataLeafValue> result;
    if (json.empty() || json == "[]") {
        return result;
    }

    // Simple state-machine parser for [["hex","hex"],["hex","hex"],...]
    std::vector<std::string> hex_values;
    std::string current;
    bool in_string = false;

    for (char c : json) {
        if (c == '"') {
            in_string = !in_string;
        } else if (in_string) {
            current += c;
        } else if ((c == ',' || c == ']') && !current.empty()) {
            hex_values.push_back(std::move(current));
            current.clear();
        }
    }

    // hex_values should have pairs: slot, value, slot, value, ...
    if (hex_values.size() % 2 != 0) {
        std::cerr << "Warning: odd number of hex values in prefilled public data, ignoring last" << '\n';
    }
    for (size_t i = 0; i + 1 < hex_values.size(); i += 2) {
        result.emplace_back(hex_to_fr(hex_values[i]), hex_to_fr(hex_values[i + 1]));
    }
    return result;
}

// ---------------------------------------------------------------------------
// IPC server execution
// ---------------------------------------------------------------------------

int execute_wsdb_server(const std::string& input_path,
                        const std::string& data_dir,
                        const std::string& tree_heights_json,
                        const std::string& tree_prefill_json,
                        const std::string& map_sizes_json,
                        uint32_t threads,
                        uint32_t initial_header_generator_point,
                        const std::string& prefilled_public_data_json)
{
    const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;

    // Parse config
    auto tree_height = parse_tree_uint32_map(tree_heights_json);
    auto tree_prefill = parse_tree_index_map(tree_prefill_json);

    std::unordered_map<MerkleTreeId, uint64_t> map_size{
        { MerkleTreeId::ARCHIVE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::NULLIFIER_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::NOTE_HASH_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::PUBLIC_DATA_TREE, DEFAULT_MAP_SIZE },
        { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, DEFAULT_MAP_SIZE },
    };
    if (!map_sizes_json.empty()) {
        auto parsed = parse_tree_uint64_map(map_sizes_json);
        for (const auto& [k, v] : parsed) {
            map_size[k] = v;
        }
    }

    // Parse prefilled public data: JSON array of ["slot_hex","value_hex"] pairs
    std::vector<PublicDataLeafValue> prefilled_public_data;
    if (!prefilled_public_data_json.empty()) {
        prefilled_public_data = parse_prefilled_public_data(prefilled_public_data_json);
        std::cerr << "Parsed " << prefilled_public_data.size() << " prefilled public data entries" << '\n';
    }

    // Create WorldState
    std::cerr << "Creating WorldState at " << data_dir << " with " << threads << " threads" << '\n';
    auto ws = std::make_unique<WorldState>(
        threads, data_dir, map_size, tree_height, tree_prefill, prefilled_public_data, initial_header_generator_point);

    WsdbRequest request{ .world_state = *ws };

    // Signal handling: SIGTERM/SIGINT trigger graceful shutdown via atomic flag.
    static std::atomic<bool> shutdown_flag{ false };
    auto signal_handler = [](int) { shutdown_flag.store(true, std::memory_order_release); };
    std::signal(SIGTERM, signal_handler);
    std::signal(SIGINT, signal_handler);
    std::signal(SIGPIPE, SIG_IGN);

    // Parent death monitoring (SIGTERM on Linux, kqueue on macOS)
    bb::monitor_parent_process(shutdown_flag);

    // Run server using generated dispatch.
    std::cerr << "aztec-wsdb IPC server starting on " << input_path << '\n';
    serve(input_path.c_str(), request, &shutdown_flag);
    return 0;
}

} // namespace bb::wsdb
