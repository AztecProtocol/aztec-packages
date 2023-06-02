#pragma once

#include "../function_execution_context.hpp"

#include "aztec3/utils/types/circuit_types.hpp"

#include <barretenberg/barretenberg.hpp>

namespace {
using aztec3::circuits::apps::FunctionExecutionContext;
}

namespace aztec3::circuits::apps::state_vars {

using aztec3::utils::types::CircuitTypes;
using crypto::generators::generator_index_t;

template <typename Composer>
StateVar<Composer>::StateVar(FunctionExecutionContext<Composer>* exec_ctx, std::string const& state_var_name)
    : exec_ctx(exec_ctx), state_var_name(state_var_name)
{
    // NOLINTBEGIN(cppcoreguidelines-prefer-member-initializer)
    // this ^ linter rule breaks things here here
    start_slot = exec_ctx->contract->get_start_slot(state_var_name);
    storage_slot_point = compute_slot_point();
    // NOLINTEND(cppcoreguidelines-prefer-member-initializer)
}

template <typename Composer> typename CircuitTypes<Composer>::grumpkin_point StateVar<Composer>::compute_slot_point()
{
    ASSERT(level_of_container_nesting == 0);
    return CT::commit({ start_slot }, { StorageSlotGeneratorIndex::BASE_SLOT });
}

// template class PrivateStateVar<Composer>;

};  // namespace aztec3::circuits::apps::state_vars
