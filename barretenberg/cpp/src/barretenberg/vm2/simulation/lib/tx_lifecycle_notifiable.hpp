#pragma once

#include <optional>
#include <span>

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/indexed_tree/indexed_leaf.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/world_state/types.hpp"
#include "barretenberg/world_state/world_state.hpp"

namespace bb::avm2::simulation {

class TransactionLifecycleNotifiable {
  public:
    virtual ~TransactionLifecycleNotifiable() = default;
    virtual void on_simulation_started() = 0;
    virtual void on_simulation_ended() = 0;
};

} // namespace bb::avm2::simulation
