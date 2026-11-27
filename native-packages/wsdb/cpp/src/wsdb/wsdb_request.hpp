#pragma once
/**
 * @file wsdb_request.hpp
 * @brief Service-level context passed to every wsdb handler.
 *
 * Each codegen-emitted handler takes a WsdbRequest& as its `Ctx`. It bundles the
 * WorldState the handlers operate on and the WsdbScheduler they hand deferred
 * work to (so reads run concurrently and writes are serialized per fork — see
 * wsdb_schedule.hpp / wsdb_scheduler.hpp).
 */
#include "world_state/world_state.hpp"
#include "wsdb/generated/wsdb_types.hpp"

#include <atomic>
#include <functional>
#include <stdexcept>

namespace azteclabs::wsdb {

class WsdbScheduler;

struct WsdbRequest {
    /**
     * The world state every command but Init runs on. A command that arrives before Init is answered with an
     * error.
     */
    world_state::WorldState& world_state() const
    {
        auto* state = world_state_.load(std::memory_order_acquire);
        if (state == nullptr) {
            throw std::runtime_error("aztec-wsdb has no world state yet: send Init first");
        }
        return *state;
    }

    /**
     * Where handlers submit their work, via the schedule_read / schedule_write helpers in wsdb_schedule.hpp. A
     * command that arrives before Init is answered with an error.
     */
    WsdbScheduler& scheduler() const
    {
        auto* scheduler = scheduler_.load(std::memory_order_acquire);
        if (scheduler == nullptr) {
            throw std::runtime_error("aztec-wsdb has no world state yet: send Init first");
        }
        return *scheduler;
    }

    // Both set by `init` when Init arrives.
    std::atomic<world_state::WorldState*> world_state_{ nullptr };
    std::atomic<WsdbScheduler*> scheduler_{ nullptr };
    // Creates the world state at Init's genesis and options; throws if the service already has one.
    std::function<void(wire::WsdbInit&&)> init;
};

} // namespace azteclabs::wsdb
