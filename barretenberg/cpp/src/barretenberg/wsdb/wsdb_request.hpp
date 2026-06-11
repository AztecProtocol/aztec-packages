#pragma once
/**
 * @file wsdb_request.hpp
 * @brief Service-level context passed to every wsdb handler.
 *
 * Each codegen-emitted handler in wsdb_handlers.hpp takes a WsdbRequest&
 * as its `Ctx`. The struct owns no state of its own — it just bundles the
 * WorldState reference handlers need to do their work.
 */
#include "barretenberg/world_state/world_state.hpp"

namespace bb::wsdb {

struct WsdbRequest {
    world_state::WorldState& world_state;
};

} // namespace bb::wsdb
