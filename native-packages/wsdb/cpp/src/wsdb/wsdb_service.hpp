#pragma once
/**
 * @file wsdb_service.hpp
 * @brief The wsdb service without a transport: the world state, the dispatch pool, the per-fork scheduler and the
 * generated async handler over them.
 *
 * The IPC server feeds the handler from its reactor; `call` runs it in-process. The service has no stores, pool or
 * scheduler until Init, which carries the genesis and, in its options, the data directory, map sizes and threads.
 */
#include "common/thread_pool.hpp"
#include "world_state/world_state.hpp"
#include "wsdb/generated/wsdb_dispatch.hpp"
#include "wsdb/wsdb_request.hpp"

#include <cstdint>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <span>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace azteclabs::wsdb {

class WsdbScheduler;

/** aztec-wsdb's own configuration, which Init carries in its `options`. */
struct WsdbOptions {
    std::string data_dir;
    // LMDB map sizes in KB, by tree; trees not named keep the default.
    std::unordered_map<world_state::MerkleTreeId, uint64_t> map_sizes;
    uint32_t threads = 16;

    /**
     * Reads Init's options: a msgpack map with `dataDir` (required), `mapSizes` (an array of { treeId, sizeKb }) and
     * `threads`. Throws on anything else, so options meant for another implementation are refused.
     */
    static WsdbOptions decode(const std::optional<std::vector<uint8_t>>& options);
};

/**
 * One aztec-wsdb instance: the world state Init creates and the scheduler its requests run on. The server process
 * serves one; libaztec_wsdb makes one per create(). One instance takes calls from many threads at once.
 */
class WsdbService final : public Service {
  public:
    WsdbService();
    ~WsdbService() override;

    WsdbService(const WsdbService&) = delete;
    WsdbService& operator=(const WsdbService&) = delete;
    WsdbService(WsdbService&&) = delete;
    WsdbService& operator=(WsdbService&&) = delete;

    /** Decodes one request, schedules its work and responds when done, possibly from a pool thread. Requests may
     *  be submitted from several threads at once. */
    AsyncDispatchHandler& dispatcher() override { return handler_; }

    /**
     * Whether another request is already waiting to be read; reads run inline on the submitting thread only when
     * this is false (see WsdbScheduler). Without a transport nothing ever waits, so an idle read always runs on its
     * caller. Set before Init.
     */
    void set_has_pending_request(std::function<bool()> has_pending_request) override
    {
        has_pending_request_ = std::move(has_pending_request);
    }

    /** Runs one request in-process and waits for its response. Safe to call from several threads at once. */
    std::vector<uint8_t> call(std::span<const uint8_t> request);

  private:
    std::function<bool()> has_pending_request_ = [] { return false; };
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
