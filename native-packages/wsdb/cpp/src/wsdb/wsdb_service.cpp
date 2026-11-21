#include "wsdb/wsdb_service.hpp"
#include "merkle_tree/indexed_leaf.hpp"
#include "world_state/wire.hpp"
#include "wsdb/wsdb_handlers.hpp"
#include "wsdb/wsdb_scheduler.hpp"

#include <msgpack.hpp>

#include <algorithm>
#include <condition_variable>
#include <cstdint>
#include <iostream>
#include <mutex>
#include <optional>
#include <span>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace azteclabs::wsdb {

using namespace azteclabs::wsdb::world_state;
using namespace azteclabs::wsdb::merkle_tree;

namespace {

uint64_t as_uint(const msgpack::object& value, const char* field)
{
    if (value.type != msgpack::type::POSITIVE_INTEGER) {
        throw std::invalid_argument(std::string("aztec-wsdb Init options: ") + field +
                                    " must be a non-negative integer");
    }
    return value.via.u64;
}

} // namespace

WsdbOptions WsdbOptions::decode(const std::optional<std::vector<uint8_t>>& options)
{
    if (!options.has_value() || options->empty()) {
        throw std::invalid_argument("aztec-wsdb needs Init options with its dataDir");
    }
    msgpack::object_handle handle;
    try {
        handle = msgpack::unpack(reinterpret_cast<const char*>(options->data()), options->size());
    } catch (const std::exception& e) {
        throw std::invalid_argument(std::string("aztec-wsdb Init options are not msgpack: ") + e.what());
    }
    const msgpack::object& root = handle.get();
    if (root.type != msgpack::type::MAP) {
        throw std::invalid_argument("aztec-wsdb Init options must be a map");
    }
    WsdbOptions result;
    bool has_data_dir = false;
    for (const auto& entry : std::span(root.via.map.ptr, root.via.map.size)) {
        if (entry.key.type != msgpack::type::STR) {
            throw std::invalid_argument("aztec-wsdb Init options: keys must be strings");
        }
        std::string key(entry.key.via.str.ptr, entry.key.via.str.size);
        const msgpack::object& value = entry.val;
        if (key == "dataDir") {
            if (value.type != msgpack::type::STR || value.via.str.size == 0) {
                throw std::invalid_argument("aztec-wsdb Init options: dataDir must be a non-empty string");
            }
            result.data_dir.assign(value.via.str.ptr, value.via.str.size);
            has_data_dir = true;
        } else if (key == "threads") {
            uint64_t threads = as_uint(value, "threads");
            if (threads == 0 || threads > UINT32_MAX) {
                throw std::invalid_argument("aztec-wsdb Init options: threads must be positive");
            }
            result.threads = static_cast<uint32_t>(threads);
        } else if (key == "mapSizes") {
            if (value.type != msgpack::type::ARRAY) {
                throw std::invalid_argument("aztec-wsdb Init options: mapSizes must be an array");
            }
            for (const auto& item : std::span(value.via.array.ptr, value.via.array.size)) {
                if (item.type != msgpack::type::MAP) {
                    throw std::invalid_argument("aztec-wsdb Init options: mapSizes holds { treeId, sizeKb } maps");
                }
                std::optional<uint64_t> tree_id;
                std::optional<uint64_t> size_kb;
                for (const auto& field : std::span(item.via.map.ptr, item.via.map.size)) {
                    std::string name = field.key.type == msgpack::type::STR
                                           ? std::string(field.key.via.str.ptr, field.key.via.str.size)
                                           : std::string();
                    if (name == "treeId") {
                        tree_id = as_uint(field.val, "mapSizes.treeId");
                    } else if (name == "sizeKb") {
                        size_kb = as_uint(field.val, "mapSizes.sizeKb");
                    } else {
                        throw std::invalid_argument("aztec-wsdb Init options: mapSizes holds { treeId, sizeKb } maps");
                    }
                }
                if (!tree_id.has_value() || !size_kb.has_value()) {
                    throw std::invalid_argument("aztec-wsdb Init options: mapSizes holds { treeId, sizeKb } maps");
                }
                result.map_sizes[from_wire<MerkleTreeId>(static_cast<uint32_t>(*tree_id))] = *size_kb;
            }
        } else {
            throw std::invalid_argument("aztec-wsdb Init options: unknown option " + key);
        }
    }
    if (!has_data_dir) {
        throw std::invalid_argument("aztec-wsdb Init options: dataDir is required");
    }
    return result;
}

namespace {

std::unique_ptr<WorldState> make_world_state(const WsdbOptions& options, const wire::WsdbInit& init)
{
    const uint64_t DEFAULT_MAP_SIZE = 1024UL * 1024;
    std::unordered_map<world_state::MerkleTreeId, uint64_t> map_size{
        { world_state::MerkleTreeId::ARCHIVE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::NULLIFIER_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::NOTE_HASH_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::PUBLIC_DATA_TREE, DEFAULT_MAP_SIZE },
        { world_state::MerkleTreeId::L1_TO_L2_MESSAGE_TREE, DEFAULT_MAP_SIZE },
    };
    for (const auto& [tree, size] : options.map_sizes) {
        map_size[tree] = size;
    }
    std::unordered_map<MerkleTreeId, uint32_t> tree_heights;
    for (const auto& height : init.treeHeights) {
        tree_heights[from_wire<MerkleTreeId>(height.treeId)] = height.height;
    }
    std::unordered_map<MerkleTreeId, index_t> tree_prefill;
    for (const auto& prefill : init.treePrefill) {
        tree_prefill[from_wire<MerkleTreeId>(prefill.treeId)] = static_cast<index_t>(prefill.size);
    }
    std::cerr << "Creating WorldState at " << options.data_dir << " with " << options.threads << " threads" << '\n';
    return std::make_unique<WorldState>(options.threads,
                                        options.data_dir,
                                        map_size,
                                        tree_heights,
                                        tree_prefill,
                                        from_wire<std::vector<PublicDataLeafValue>>(init.prefilledPublicData),
                                        from_wire<std::vector<fr>>(init.prefilledNullifiers),
                                        init.initialHeaderGeneratorPoint,
                                        init.genesisTimestamp);
}

} // namespace

WsdbService::WsdbService()
{
    request_.init = [this](wire::WsdbInit&& init) {
        // Init may race another Init from a second caller thread; only one may create the world state.
        std::lock_guard<std::mutex> lock(init_mutex_);
        if (world_state_) {
            throw std::runtime_error("aztec-wsdb already has a world state: Init is sent once");
        }
        auto options = WsdbOptions::decode(init.options);
        auto world_state = make_world_state(options, init);
        // Sized from the caller-provided `threads` budget, NOT std::thread::hardware_concurrency(): the latter
        // ignores cgroup CPU limits and reports the host core count (e.g. 192 in a 2-CPU CI container), which would
        // spawn a huge pool per wsdb and exhaust the per-UID thread limit (pthread_create EAGAIN).
        dispatch_pool_ = std::make_unique<ThreadPool>(std::max<uint32_t>(2, options.threads));
        // Server-side ordering: the database, not the client, guarantees per-fork read/write consistency. Each
        // handler hands its work to the scheduler via schedule_read / schedule_write, which run reads concurrently
        // and serialize writes per fork.
        scheduler_ = std::make_shared<WsdbScheduler>(*dispatch_pool_, has_pending_request_);
        world_state_ = std::move(world_state);
        request_.scheduler_.store(scheduler_.get(), std::memory_order_release);
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

std::unique_ptr<Service> make_service()
{
    return std::make_unique<WsdbService>();
}

} // namespace azteclabs::wsdb
