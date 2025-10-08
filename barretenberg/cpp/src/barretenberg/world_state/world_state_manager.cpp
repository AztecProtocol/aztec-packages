#include "world_state_manager.hpp"

namespace bb::world_state {

// Definition of the static member variable
std::unique_ptr<WorldState> WorldStateManager::ws = nullptr;

} // namespace bb::world_state
