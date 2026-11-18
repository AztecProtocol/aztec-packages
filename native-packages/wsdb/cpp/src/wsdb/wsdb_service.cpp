#include "wsdb/wsdb_service.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "world_state/wire.hpp"
#include "wsdb/wsdb_handlers.hpp"
#include "wsdb/wsdb_scheduler.hpp"

#include <CLI/CLI.hpp>
#include <algorithm>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace azteclabs::wsdb {

using namespace azteclabs::wsdb::world_state;
using namespace azteclabs::wsdb::merkle_tree;

/** Parses the map sizes option, "{0:1024,1:2048,...}". */
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

void add_wsdb_config_options(CLI::App& app, WsdbConfig& config)
{
    app.add_option("-d,--data-dir", config.data_dir, "Data directory for LMDB stores")->required();
    app.add_option("--map-sizes", config.map_sizes_json, "LMDB map sizes in KB as JSON: {0:1024,...}");
    app.add_option("-t,--threads", config.threads, "Thread pool size (default: 16)")->check(CLI::PositiveNumber);
}

namespace {

std::unique_ptr<WorldState> make_world_state(const WsdbConfig& config, const wire::WsdbInit& init)
{
    const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;
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
    std::unordered_map<MerkleTreeId, uint32_t> tree_heights;
    for (const auto& height : init.treeHeights) {
        tree_heights[from_wire<MerkleTreeId>(height.treeId)] = height.height;
    }
    std::unordered_map<MerkleTreeId, index_t> tree_prefill;
    for (const auto& prefill : init.treePrefill) {
        tree_prefill[from_wire<MerkleTreeId>(prefill.treeId)] = static_cast<index_t>(prefill.size);
    }
    std::cerr << "Creating WorldState at " << config.data_dir << " with " << config.threads << " threads" << '\n';
    return std::make_unique<WorldState>(config.threads,
                                        config.data_dir,
                                        map_size,
                                        tree_heights,
                                        tree_prefill,
                                        from_wire<std::vector<PublicDataLeafValue>>(init.prefilledPublicData),
                                        from_wire<std::vector<fr>>(init.prefilledNullifiers),
                                        init.initialHeaderGeneratorPoint,
                                        init.genesisTimestamp);
}

} // namespace

WsdbService::WsdbService(const WsdbConfig& config, std::function<bool()> has_pending_request)
    : config_(config)
    // Sized from the caller-provided `threads` budget, NOT std::thread::hardware_concurrency(): the latter ignores
    // cgroup CPU limits and reports the host core count (e.g. 192 in a 2-CPU CI container), which would spawn a huge
    // pool per wsdb process and exhaust the per-UID thread limit (pthread_create EAGAIN).
    , dispatch_pool_(std::make_unique<ThreadPool>(std::max<uint32_t>(2, config.threads)))
    // Server-side ordering: the database, not the client, guarantees per-fork read/write consistency. Each handler
    // hands its work to the scheduler via schedule_read / schedule_write, which run reads concurrently and serialize
    // writes per fork.
    , scheduler_(std::make_shared<WsdbScheduler>(*dispatch_pool_, std::move(has_pending_request)))
{
    request_.scheduler = scheduler_.get();
    request_.init = [this](wire::WsdbInit&& init) {
        // Init may race another Init from a second caller thread; only one may create the world state.
        std::lock_guard<std::mutex> lock(init_mutex_);
        if (world_state_) {
            throw std::runtime_error("aztec-wsdb already has a world state: Init is sent once");
        }
        world_state_ = make_world_state(config_, init);
        request_.world_state_.store(world_state_.get(), std::memory_order_release);
    };
    handler_ = make_wsdb_handler(request_);
}

WsdbService::~WsdbService()
{
    // Join the pool before the world state its in-flight work uses goes away.
    dispatch_pool_.reset();
}

std::vector<uint8_t> WsdbService::call(std::span<const uint8_t> request)
{
    // Handlers may respond later, from a pool thread, so wait for the response here.
    std::mutex mutex;
    std::condition_variable cv;
    std::optional<std::vector<uint8_t>> response;
    handler_(request, [&](std::vector<uint8_t> frame) {
        std::lock_guard<std::mutex> lock(mutex);
        response = std::move(frame);
        cv.notify_one();
    });
    std::unique_lock<std::mutex> lock(mutex);
    cv.wait(lock, [&] { return response.has_value(); });
    return std::move(*response);
}

} // namespace azteclabs::wsdb
