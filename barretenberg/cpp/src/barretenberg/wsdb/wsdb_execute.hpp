#pragma once
/**
 * @file wsdb_execute.hpp
 * @brief WsdbRequest context for command execution.
 */

#include "barretenberg/world_state/world_state.hpp"

namespace bb::wsdb {

/**
 * @brief Context passed to each command's execute() method, providing access to the WorldState.
 */
struct WsdbRequest {
    world_state::WorldState& world_state;
};

} // namespace bb::wsdb
