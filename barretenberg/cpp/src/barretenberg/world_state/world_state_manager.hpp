#pragma once

#include "barretenberg/common/assert.hpp"
#include "barretenberg/world_state/world_state.hpp"

namespace bb::world_state {

// WordStateManager manages a singleton instance of WorldState
class WorldStateManager {
  public:
    WorldStateManager() = delete;
    ~WorldStateManager() = delete;
    WorldStateManager(const WorldStateManager&) = delete;
    WorldStateManager(WorldStateManager&&) = delete;
    WorldStateManager& operator=(const WorldStateManager&) = delete;
    WorldStateManager& operator=(WorldStateManager&&) = delete;

    static WorldState* initialise_world_state(uint64_t thread_pool_size,
                                              const std::string& data_dir,
                                              const std::unordered_map<MerkleTreeId, uint64_t>& map_size,
                                              const std::unordered_map<MerkleTreeId, uint32_t>& tree_heights,
                                              const std::unordered_map<MerkleTreeId, index_t>& tree_prefill,
                                              const std::vector<PublicDataLeafValue>& prefilled_public_data,
                                              uint32_t initial_header_generator_point)
    {
        BB_ASSERT(ws == nullptr);
        ws = std::make_unique<WorldState>(thread_pool_size,
                                          data_dir,
                                          map_size,
                                          tree_heights,
                                          tree_prefill,
                                          prefilled_public_data,
                                          initial_header_generator_point);
        return ws.get();
    }

    static WorldState* get_world_state()
    {
        BB_ASSERT(ws != nullptr);
        return ws.get();
    };

    static bool has_world_state() { return ws != nullptr; }

    static void reset_world_state() { ws.reset(); }

  private:
    inline static std::unique_ptr<WorldState> ws = nullptr;
};

} // namespace bb::world_state
