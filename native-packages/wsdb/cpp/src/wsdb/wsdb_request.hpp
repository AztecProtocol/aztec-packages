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
     * The world state every command but Init runs on. A command that arrives before there is one (the service was
     * started without a genesis and has not been sent Init) is answered with an error.
     */
    world_state::WorldState& world_state() const
    {
        auto* state = world_state_.load(std::memory_order_acquire);
        if (state == nullptr) {
            throw std::runtime_error("aztec-wsdb has no world state yet: send Init first");
        }
        return *state;
    }

    // Set by the service: from its genesis options when it starts, or by `init` when Init arrives.
    std::atomic<world_state::WorldState*> world_state_{ nullptr };
    // Creates the world state at Init's genesis; throws if the service already has one.
    std::function<void(wire::WsdbInit&&)> init;
    // Set once before serving; handlers submit their work through it via the
    // schedule_read / schedule_write helpers in wsdb_schedule.hpp.
    WsdbScheduler* scheduler = nullptr;
};

} // namespace azteclabs::wsdb
