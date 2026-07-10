#include "barretenberg/wsdb/wsdb_ffi.h"

#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_server.hpp"
#include "barretenberg/wsdb/wsdb_handlers.hpp"
#include "barretenberg/wsdb/wsdb_request.hpp"
#include "barretenberg/wsdb/wsdb_scheduler.hpp"

#include <algorithm>
#include <cstdint>
#include <exception>
#include <functional>
#include <memory>
#include <span>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

// ---------------------------------------------------------------------------
// Opaque handle: owns the per-instance context the wsdb dispatch reads from.
// Kept a name-only C type in the header so no C++ leaks across the ABI. Member
// order matters: world_state and scheduler outlive the request that references
// them, and the handler (which captures &request) is last. Never moved — the
// instance is heap-allocated and handed out as a raw pointer.
// ---------------------------------------------------------------------------
struct wsdb_instance {
    std::unique_ptr<WorldState> world_state;
    std::unique_ptr<bb::ThreadPool> dispatch_pool;
    std::shared_ptr<bb::wsdb::WsdbScheduler> scheduler;
    std::unique_ptr<bb::wsdb::WsdbRequest> request;
    bb::wsdb::AsyncDispatchHandler handler;
};

namespace {

// ---------------------------------------------------------------------------
// Simple JSON-like parsing for config maps.
// Parses "{0:1024,1:2048,...}" into unordered_map<MerkleTreeId, uint64_t>.
// ---------------------------------------------------------------------------

std::unordered_map<MerkleTreeId, uint64_t> parse_tree_uint64_map(const std::string& json)
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

std::unordered_map<MerkleTreeId, uint32_t> parse_tree_uint32_map(const std::string& json)
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

std::unordered_map<MerkleTreeId, index_t> parse_tree_index_map(const std::string& json)
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
// Parse prefilled public data from JSON: [["slot_hex","value_hex"],...].
// Each hex string is a 64-char (32-byte) hex-encoded field element.
// ---------------------------------------------------------------------------

fr hex_to_fr(const std::string& hex)
{
    std::string cleaned = hex;
    if (cleaned.size() >= 2 && cleaned[0] == '0' && (cleaned[1] == 'x' || cleaned[1] == 'X')) {
        cleaned = cleaned.substr(2);
    }
    return fr(cleaned);
}

std::vector<PublicDataLeafValue> parse_prefilled_public_data(const std::string& json)
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
        info("Warning: odd number of hex values in prefilled public data, ignoring last");
    }
    for (size_t i = 0; i + 1 < hex_values.size(); i += 2) {
        result.emplace_back(hex_to_fr(hex_values[i]), hex_to_fr(hex_values[i + 1]));
    }
    return result;
}

} // namespace

extern "C" {

wsdb_instance_t* wsdb_create(const char* data_dir,
                             const char* tree_heights_json,
                             const char* tree_prefill_json,
                             const char* map_sizes_json,
                             uint32_t threads,
                             uint32_t initial_header_generator_point,
                             const char* prefilled_public_data_json,
                             uint64_t genesis_timestamp,
                             wsdb_has_pending_fn has_pending,
                             void* has_pending_ctx)
{
    if (data_dir == nullptr) {
        return nullptr;
    }
    try {
        const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;

        auto tree_height = parse_tree_uint32_map(tree_heights_json != nullptr ? tree_heights_json : "");
        auto tree_prefill = parse_tree_index_map(tree_prefill_json != nullptr ? tree_prefill_json : "");

        std::unordered_map<MerkleTreeId, uint64_t> map_size{
            { MerkleTreeId::ARCHIVE, DEFAULT_MAP_SIZE },
            { MerkleTreeId::NULLIFIER_TREE, DEFAULT_MAP_SIZE },
            { MerkleTreeId::NOTE_HASH_TREE, DEFAULT_MAP_SIZE },
            { MerkleTreeId::PUBLIC_DATA_TREE, DEFAULT_MAP_SIZE },
            { MerkleTreeId::L1_TO_L2_MESSAGE_TREE, DEFAULT_MAP_SIZE },
        };
        if (map_sizes_json != nullptr && map_sizes_json[0] != '\0') {
            auto parsed = parse_tree_uint64_map(map_sizes_json);
            for (const auto& [k, v] : parsed) {
                map_size[k] = v;
            }
        }

        std::vector<PublicDataLeafValue> prefilled_public_data;
        if (prefilled_public_data_json != nullptr && prefilled_public_data_json[0] != '\0') {
            prefilled_public_data = parse_prefilled_public_data(prefilled_public_data_json);
            info("Parsed ", prefilled_public_data.size(), " prefilled public data entries");
        }

        auto inst = std::make_unique<wsdb_instance>();

        info("Creating WorldState at ", data_dir, " with ", threads, " threads");
        inst->world_state = std::make_unique<WorldState>(threads,
                                                         std::string(data_dir),
                                                         map_size,
                                                         tree_height,
                                                         tree_prefill,
                                                         prefilled_public_data,
                                                         initial_header_generator_point,
                                                         genesis_timestamp);
        inst->request =
            std::make_unique<bb::wsdb::WsdbRequest>(bb::wsdb::WsdbRequest{ .world_state = *inst->world_state });

        // Dispatch pool: services requests concurrently so parallel reads aren't
        // serialized through the caller's single dispatch thread. Deliberately
        // DISTINCT from WorldState's own intra-op pool (the `threads` arg above):
        // mutating handlers enqueue subtasks onto that pool and wait() on them, so
        // dispatching those handlers onto the SAME pool could deadlock
        // (bb::ThreadPool is blocking and non-work-stealing).
        //
        // Sized from the caller-provided `threads` budget (the same value used for
        // the WorldState pool), NOT std::thread::hardware_concurrency() — the
        // latter ignores cgroup CPU limits and reports the host core count (e.g.
        // 192 in a 2-CPU CI container), which would spawn a huge pool and exhaust
        // the per-UID thread limit (pthread_create EAGAIN).
        uint32_t dispatch_threads = std::max<uint32_t>(2, threads);
        inst->dispatch_pool = std::make_unique<bb::ThreadPool>(dispatch_threads);

        // Inline-fast-path gate: the socket host passes its server's
        // has_pending_request(); an in-process single-in-flight host passes NULL
        // (always "none pending" — nothing to wait behind).
        std::function<bool()> pending_pred;
        if (has_pending != nullptr) {
            pending_pred = [has_pending, has_pending_ctx]() { return has_pending(has_pending_ctx) != 0; };
        } else {
            pending_pred = []() { return false; };
        }
        inst->scheduler = std::make_shared<bb::wsdb::WsdbScheduler>(*inst->dispatch_pool, std::move(pending_pred));
        inst->request->scheduler = inst->scheduler.get();

        inst->handler = bb::wsdb::make_wsdb_handler(*inst->request);
        return inst.release();
    } catch (const std::exception& e) {
        info("wsdb_create failed: ", e.what());
        return nullptr;
    } catch (...) {
        return nullptr;
    }
}

int wsdb_call(wsdb_instance_t* instance, const uint8_t* req, size_t req_len, void* respond_ctx, wsdb_respond_fn respond)
{
    if (instance == nullptr || respond == nullptr) {
        return -1;
    }
    try {
        bb::wsdb::RawRespond raw_respond = [respond, respond_ctx](std::vector<uint8_t> response) {
            respond(respond_ctx, response.data(), response.size());
        };
        instance->handler(std::span<const uint8_t>(req, req_len), std::move(raw_respond));
        return 0;
    } catch (const std::exception& e) {
        info("wsdb_call failed: ", e.what());
        return -1;
    } catch (...) {
        return -1;
    }
}

void wsdb_destroy(wsdb_instance_t* instance)
{
    delete instance;
}

} // extern "C"
