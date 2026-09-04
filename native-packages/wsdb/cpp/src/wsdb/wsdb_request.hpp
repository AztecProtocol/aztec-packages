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

namespace azteclabs::wsdb {

class WsdbScheduler;

struct WsdbRequest {
    world_state::WorldState& world_state;
    // Set once before serving; handlers submit their work through it via the
    // schedule_read / schedule_write helpers in wsdb_schedule.hpp.
    WsdbScheduler* scheduler = nullptr;
};

} // namespace azteclabs::wsdb
