#pragma once
#include "barretenberg/world_state/world_state.hpp"

namespace bb::wsdb {
struct WsdbContext {
    world_state::WorldState& world_state;
};
} // namespace bb::wsdb
