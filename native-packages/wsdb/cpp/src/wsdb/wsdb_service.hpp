#pragma once
/**
 * @file wsdb_service.hpp
 * @brief The wsdb service without a transport: the world state, the dispatch pool, the per-fork scheduler and the
 * generated async handler over them.
 *
 * The IPC server feeds the handler from its reactor; the in-process FFI entry (wsdb_ffi_service.cpp) feeds it from the
 * caller's thread. Both build it from the same WsdbConfig, which the `msgpack run` CLI and the FFI open call parse
 * with the same options.
 */
#include "common/thread_pool.hpp"
#include "world_state/world_state.hpp"
#include "wsdb/generated/wsdb_dispatch.hpp"
#include "wsdb/wsdb_request.hpp"

#include <cstdint>
#include <functional>
#include <memory>
#include <string>

namespace CLI {
class App;
}

namespace azteclabs::wsdb {

class WsdbScheduler;

struct WsdbConfig {
    std::string data_dir;
    // Maps as "{treeId:value,...}".
    std::string tree_heights_json;
    std::string tree_prefill_json;
    // LMDB map sizes in KB.
    std::string map_sizes_json;
    uint32_t threads = 16;
    uint32_t initial_header_generator_point = 0;
    // [["slot_hex","value_hex"],...]
    std::string prefilled_public_data_json;
    // ["nullifier_hex",...]
    std::string prefilled_nullifiers_json;
    uint64_t genesis_timestamp = 0;
};

/** Registers the WsdbConfig options on a CLI (sub)command. */
void add_wsdb_config_options(CLI::App& app, WsdbConfig& config);

class WsdbService {
  public:
    /**
     * @param has_pending_request Whether another request is already waiting; reads run inline on the submitting
     *        thread only when this is false (see WsdbScheduler).
     */
    WsdbService(const WsdbConfig& config, std::function<bool()> has_pending_request);
    ~WsdbService();

    WsdbService(const WsdbService&) = delete;
    WsdbService& operator=(const WsdbService&) = delete;
    WsdbService(WsdbService&&) = delete;
    WsdbService& operator=(WsdbService&&) = delete;

    /** Decodes one request, schedules its work and responds when done, possibly from a pool thread. Submissions
     *  must come from one thread at a time. */
    AsyncDispatchHandler& handler() { return handler_; }

  private:
    std::unique_ptr<world_state::WorldState> world_state_;
    // Distinct from WorldState's own pool: mutating handlers enqueue subtasks there and wait on them, so dispatching
    // them onto the same blocking, non-work-stealing pool could deadlock.
    std::unique_ptr<ThreadPool> dispatch_pool_;
    WsdbRequest request_;
    std::shared_ptr<WsdbScheduler> scheduler_;
    AsyncDispatchHandler handler_;
};

} // namespace azteclabs::wsdb
