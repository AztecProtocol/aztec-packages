#include "barretenberg/wsdb/wsdb_ipc_server.hpp"
#include "barretenberg/common/log.hpp"
#include "barretenberg/common/thread_pool.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/serialize/msgpack.hpp"
#include "barretenberg/world_state/world_state.hpp"
#include "barretenberg/wsdb/generated/wsdb_ipc_server.hpp"
#include "barretenberg/wsdb/wsdb_handlers.hpp"
#include "barretenberg/wsdb/wsdb_request.hpp"
#include "barretenberg/wsdb/wsdb_scheduler.hpp"
#include "ipc_runtime/ipc_server.hpp"
#include "ipc_runtime/serve_helper.hpp"
#include "ipc_runtime/signal_handlers.hpp"

#include <algorithm>
#include <cstdint>
#include <functional>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <unordered_map>
#include <vector>

namespace bb::wsdb {

using namespace bb::world_state;
using namespace bb::crypto::merkle_tree;

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
                        const std::string& prefilled_public_data_json,
                        const std::string& prefilled_nullifiers_json,
                        uint64_t genesis_timestamp,
                        size_t request_ring_size,
                        size_t response_ring_size)
{
    const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;

    // Parse config
    auto tree_height = parse_tree_uint32_map(tree_heights_json);
    auto tree_prefill = parse_tree_index_map(tree_prefill_json);

    std::unordered_map<world_state::MerkleTreeId, uint64_t> map_size{
        { world_state::MerkleTreeId::ARCHIVE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::NULLIFIER_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::NOTE_HASH_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::PUBLIC_DATA_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE, DEFAULT_MAP_SIZE },
    };
    if (!map_sizes_json.empty()) {
        auto parsed = parse_tree_uint64_map(map_sizes_json);
        for (const auto& [k, v] : parsed) {
            map_size[k] = v;
        }
    }

    // Create the IPC server and listen BEFORE the (potentially slow) WorldState
    // construction: LMDB open and genesis prefill can take arbitrarily long on
    // a loaded machine. With the socket already listening, clients connect into
    // the accept backlog immediately and their first requests wait in the
    // socket buffer until the reactor starts, so the client-side connect
    // backstop only has to cover exec + linking + reaching listen() — it never
    // races database initialization.
    //
    // Pick UDS vs MPSC-SHM by path suffix; install the runtime's default
    // lifecycle signal handlers (SIGTERM/SIGINT → request_shutdown, SIGBUS/SIGSEGV
    // → close+exit, plus parent-death monitoring via prctl/kqueue).
    ipc::ServerOptions opts;
    // TS backend (client 0) + the AVM simulator pool (one connection per
    // bb-avm-sim process). Sized to cover a default-size pool with headroom so
    // SHM isn't capped to a single AVM client. (UDS, the default transport, is
    // unaffected — it admits connections via the listen backlog.)
    opts.max_shm_clients = 8;
    opts.shm_request_ring_size = request_ring_size;
    opts.shm_response_ring_size = response_ring_size;
    auto server = ipc::make_server(input_path, opts);
    if (!server) {
        std::cerr << "Error: --input path must end with .sock or .shm: " << input_path << '\n';
        return 1;
    }
    ipc::install_default_signal_handlers(*server);

    if (!server->listen()) {
        std::cerr << "Error: Could not start IPC server" << '\n';
        return 1;
    }
    std::cerr << "aztec-wsdb listening on " << input_path << '\n';

    // Parse prefilled public data: JSON array of ["slot_hex","value_hex"] pairs
    std::vector<PublicDataLeafValue> prefilled_public_data;
    if (!prefilled_public_data_json.empty()) {
        prefilled_public_data = parse_prefilled_public_data(prefilled_public_data_json);
        std::cerr << "Parsed " << prefilled_public_data.size() << " prefilled public data entries" << '\n';
    }

    // Parse prefilled nullifiers: JSON array of "nullifier_hex" strings. The caller (TS world-state) passes the same
    // canonical genesis nullifiers it seeds via the napi path, so the IPC genesis nullifier-tree root matches.
    std::vector<bb::fr> prefilled_nullifiers;
    if (!prefilled_nullifiers_json.empty()) {
        prefilled_nullifiers = parse_prefilled_nullifiers(prefilled_nullifiers_json);
        std::cerr << "Parsed " << prefilled_nullifiers.size() << " prefilled nullifiers" << '\n';
    }

    // Create WorldState
    std::cerr << "Creating WorldState at " << data_dir << " with " << threads << " threads" << '\n';
    auto ws = std::make_unique<WorldState>(threads,
                                           data_dir,
                                           map_size,
                                           tree_height,
                                           tree_prefill,
                                           prefilled_public_data,
                                           prefilled_nullifiers,
                                           initial_header_generator_point,
                                           genesis_timestamp);

    WsdbRequest request{ .world_state = *ws };

    std::cerr << "aztec-wsdb IPC server ready" << '\n';

    // Dispatch pool: services requests concurrently so parallel reads aren't
    // serialized through the single reactor thread. It is deliberately DISTINCT
    // from WorldState's own intra-op pool (the `threads` arg above): mutating
    // handlers enqueue subtasks onto that pool and wait() on them, so dispatching
    // those handlers onto the SAME pool could deadlock (bb::ThreadPool is
    // blocking and non-work-stealing).
    //
    // Sized from the caller-provided `threads` budget (the same value used for
    // the WorldState pool), NOT std::thread::hardware_concurrency() — the latter
    // ignores cgroup CPU limits and reports the host core count (e.g. 192 in a
    // 2-CPU CI container), which would spawn a huge pool per wsdb process and
    // exhaust the per-UID thread limit (pthread_create EAGAIN).
    uint32_t dispatch_threads = std::max<uint32_t>(2, threads);
    bb::ThreadPool dispatch_pool(dispatch_threads);

    // Server-side ordering: the database, not the client, guarantees per-fork
    // read/write consistency. Each handler hands its work to this scheduler via
    // schedule_read / schedule_write (which run reads concurrently and serialize
    // writes per fork — see WsdbScheduler), so the context carries it.
    auto scheduler = std::make_shared<WsdbScheduler>(dispatch_pool, *server);
    request.scheduler = scheduler.get();

    // Async dispatch: the reactor reads each request and hands it to the
    // generated handler with a respond callback; the handler decodes, schedules
    // its work, and responds when done (possibly from a pool thread).
    auto handler = make_wsdb_handler(request);
    server->run_reactor([&handler](int /*client_id*/, std::span<const uint8_t> raw, ipc::IpcServer::Respond respond) {
        handler(raw, std::move(respond));
    });

    server->close();
    return 0;
}

} // namespace bb::wsdb
