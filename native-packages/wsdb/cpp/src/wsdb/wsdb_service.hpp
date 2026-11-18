#pragma once
/**
 * @file wsdb_service.hpp
 * @brief The wsdb service without a transport: the world state, the dispatch pool, the per-fork scheduler and the
 * generated async handler over them.
 *
 * The IPC server feeds the handler from its reactor; `call` runs it in-process. The service opens no stores until
 * Init, which carries the genesis; the data directory, map sizes and threads come from the config.
 */
#include "common/thread_pool.hpp"
#include "world_state/world_state.hpp"
#include "wsdb/generated/wsdb_dispatch.hpp"
#include "wsdb/wsdb_request.hpp"

#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <span>
#include <string>
#include <vector>

namespace CLI {
class App;
}

namespace azteclabs::wsdb {

class WsdbScheduler;

struct WsdbConfig {
    std::string data_dir;
    // LMDB map sizes in KB, as "{treeId:value,...}".
    std::string map_sizes_json;
    uint32_t threads = 16;
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

    /** Decodes one request, schedules its work and responds when done, possibly from a pool thread. Requests may
     *  be submitted from several threads at once. */
    AsyncDispatchHandler& handler() { return handler_; }

    /** Runs one request in-process and waits for its response. Safe to call from several threads at once. */
    std::vector<uint8_t> call(std::span<const uint8_t> request);

  private:
    WsdbConfig config_;
    std::mutex init_mutex_;
    std::unique_ptr<world_state::WorldState> world_state_;
    // Distinct from WorldState's own pool: mutating handlers enqueue subtasks there and wait on them, so dispatching
    // them onto the same blocking, non-work-stealing pool could deadlock.
    std::unique_ptr<ThreadPool> dispatch_pool_;
    WsdbRequest request_;
    std::shared_ptr<WsdbScheduler> scheduler_;
    AsyncDispatchHandler handler_;
};

} // namespace azteclabs::wsdb
