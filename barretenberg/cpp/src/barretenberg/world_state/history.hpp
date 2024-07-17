#pragma once

#include <cstdint>
#include <variant>

namespace bb::world_state {

struct WorldStateRevision {
    struct FinalisedBlock {
        uint32_t block;
    };

    struct CurrentState {
        bool uncommitted;
    };

    using State = std::variant<WorldStateRevision::FinalisedBlock, WorldStateRevision::CurrentState>;
    State state;

    static WorldStateRevision committed() { return { CurrentState{ false } }; }
    static WorldStateRevision uncommitted() { return { CurrentState{ true } }; }
    static WorldStateRevision finalised_block(uint32_t block_number) { return { FinalisedBlock{ block_number } }; }
};

} // namespace bb::world_state
