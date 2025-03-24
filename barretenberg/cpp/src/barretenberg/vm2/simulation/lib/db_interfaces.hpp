#pragma once

#include <optional>

#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/crypto/merkle_tree/response.hpp"
#include "barretenberg/crypto/merkle_tree/types.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/world_state/types.hpp"

namespace bb::avm2::simulation {

class ContractDBInterface {
  public:
    virtual ~ContractDBInterface() = default;

    virtual std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const = 0;
    virtual std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const = 0;
};

// TODO(fcarreiro): We'll have to separate into LowLevel and HighLevel interfaces.
// Low level will be raw and hinted, high level will be proven.
// ADDENDUM: well actually they don't need to be separate. We might just be able to implement both low and high level in
// both raw and proven. Just that proven will not prove low level (footgun?).
class MerkleDBInterface {
  public:
    virtual ~MerkleDBInterface() = default;

    virtual const TreeSnapshots& get_tree_roots() const = 0;

    virtual crypto::merkle_tree::fr_sibling_path get_sibling_path(world_state::MerkleTreeId tree_id,
                                                                  crypto::merkle_tree::index_t leaf_index) const = 0;
    virtual crypto::merkle_tree::GetLowIndexedLeafResponse get_low_indexed_leaf(world_state::MerkleTreeId tree_id,
                                                                                const FF& value) const = 0;
};

} // namespace bb::avm2::simulation
