#include "wsdb/wsdb_service.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "wsdb/wsdb_handlers.hpp"
#include "wsdb/wsdb_scheduler.hpp"

#include <CLI/CLI.hpp>
#include <algorithm>
#include <cstdint>
#include <iostream>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace azteclabs::wsdb {

using namespace azteclabs::wsdb::world_state;
using namespace azteclabs::wsdb::merkle_tree;

// ---------------------------------------------------------------------------
// Simple JSON-like parsing for config maps
// Parses "{0:1024,1:2048,...}" into unordered_map<uint32_t, uint64_t>
// ---------------------------------------------------------------------------

static std::unordered_map<world_state::MerkleTreeId, uint64_t> parse_tree_uint64_map(const std::string& json)
{
    std::unordered_map<world_state::MerkleTreeId, uint64_t> result;
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
            auto key = static_cast<world_state::MerkleTreeId>(std::stoi(pair.substr(0, colon_pos)));
            auto value = static_cast<uint64_t>(std::stoull(pair.substr(colon_pos + 1)));
            result[key] = value;
        }
    }
    return result;
}

static std::unordered_map<world_state::MerkleTreeId, uint32_t> parse_tree_uint32_map(const std::string& json)
{
    std::unordered_map<world_state::MerkleTreeId, uint32_t> result;
    if (json.empty()) {
        return result;
    }
    auto u64_map = parse_tree_uint64_map(json);
    for (const auto& [k, v] : u64_map) {
        result[k] = static_cast<uint32_t>(v);
    }
    return result;
}

static std::unordered_map<world_state::MerkleTreeId, index_t> parse_tree_index_map(const std::string& json)
{
    std::unordered_map<world_state::MerkleTreeId, index_t> result;
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
// Parse prefilled nullifiers from JSON: ["nullifier_hex",...]
// Each hex string is a 64-char (32-byte) hex-encoded field element.
// ---------------------------------------------------------------------------

static std::vector<fr> parse_prefilled_nullifiers(const std::string& json)
{
    std::vector<fr> result;
    if (json.empty() || json == "[]") {
        return result;
    }

    std::string current;
    bool in_string = false;

    for (char c : json) {
        if (c == '"') {
            in_string = !in_string;
        } else if (in_string) {
            current += c;
        } else if ((c == ',' || c == ']') && !current.empty()) {
            result.push_back(hex_to_fr(current));
            current.clear();
        }
    }
    return result;
}


void add_wsdb_config_options(CLI::App& app, WsdbConfig& config)
{
    app.add_option("-d,--data-dir", config.data_dir, "Data directory for LMDB stores")->required();
    app.add_option("--tree-heights", config.tree_heights_json, "Tree heights as JSON: {0:40,1:32,...}");
    app.add_option("--tree-prefill", config.tree_prefill_json, "Tree prefill sizes as JSON: {0:128,2:128,...}");
    app.add_option("--map-sizes", config.map_sizes_json, "LMDB map sizes in KB as JSON: {0:1024,...}");
    app.add_option("-t,--threads", config.threads, "Thread pool size (default: 16)")->check(CLI::PositiveNumber);
    app.add_option("--initial-header-generator-point",
                   config.initial_header_generator_point,
                   "Header generator point (default: 0)");
    app.add_option(
        "--prefilled-public-data", config.prefilled_public_data_json, "Prefilled public data as JSON array");
    app.add_option(
        "--prefilled-nullifiers", config.prefilled_nullifiers_json, "Prefilled genesis nullifiers as JSON array");
    app.add_option("--genesis-timestamp", config.genesis_timestamp, "Genesis block timestamp (default: 0)");
}

static std::unique_ptr<WorldState> make_world_state(const WsdbConfig& config)
{
    const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;

    auto tree_height = parse_tree_uint32_map(config.tree_heights_json);
    auto tree_prefill = parse_tree_index_map(config.tree_prefill_json);

    std::unordered_map<world_state::MerkleTreeId, uint64_t> map_size{
        { world_state::MerkleTreeId::ARCHIVE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::NULLIFIER_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::NOTE_HASH_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::PUBLIC_DATA_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE, DEFAULT_MAP_SIZE },
    };
    for (const auto& [k, v] : parse_tree_uint64_map(config.map_sizes_json)) {
        map_size[k] = v;
    }

    std::vector<PublicDataLeafValue> prefilled_public_data;
    if (!config.prefilled_public_data_json.empty()) {
        prefilled_public_data = parse_prefilled_public_data(config.prefilled_public_data_json);
        std::cerr << "Parsed " << prefilled_public_data.size() << " prefilled public data entries" << '\n';
    }

    // The caller (TS world-state) passes the same canonical genesis nullifiers it seeds via the napi path, so the IPC
    // genesis nullifier-tree root matches.
    std::vector<fr> prefilled_nullifiers;
    if (!config.prefilled_nullifiers_json.empty()) {
        prefilled_nullifiers = parse_prefilled_nullifiers(config.prefilled_nullifiers_json);
        std::cerr << "Parsed " << prefilled_nullifiers.size() << " prefilled nullifiers" << '\n';
    }

    std::cerr << "Creating WorldState at " << config.data_dir << " with " << config.threads << " threads" << '\n';
    return std::make_unique<WorldState>(config.threads,
                                        config.data_dir,
                                        map_size,
                                        tree_height,
                                        tree_prefill,
                                        prefilled_public_data,
                                        prefilled_nullifiers,
                                        config.initial_header_generator_point,
                                        config.genesis_timestamp);
}

WsdbService::WsdbService(const WsdbConfig& config, std::function<bool()> has_pending_request)
    : world_state_(make_world_state(config))
    // Sized from the caller-provided `threads` budget, NOT std::thread::hardware_concurrency(): the latter ignores
    // cgroup CPU limits and reports the host core count (e.g. 192 in a 2-CPU CI container), which would spawn a huge
    // pool per wsdb process and exhaust the per-UID thread limit (pthread_create EAGAIN).
    , dispatch_pool_(std::make_unique<ThreadPool>(std::max<uint32_t>(2, config.threads)))
    , request_{ .world_state = *world_state_ }
    // Server-side ordering: the database, not the client, guarantees per-fork read/write consistency. Each handler
    // hands its work to the scheduler via schedule_read / schedule_write, which run reads concurrently and serialize
    // writes per fork.
    , scheduler_(std::make_shared<WsdbScheduler>(*dispatch_pool_, std::move(has_pending_request)))
{
    request_.scheduler = scheduler_.get();
    handler_ = make_wsdb_handler(request_);
}

WsdbService::~WsdbService()
{
    // Join the pool before the world state its in-flight work uses goes away.
    dispatch_pool_.reset();
}

} // namespace azteclabs::wsdb
