#pragma once

#include "barretenberg/common/utils.hpp"
#include "barretenberg/crypto/merkle_tree/hash_path.hpp"
#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"
#include "barretenberg/world_state/types.hpp"

namespace bb::avm2::simulation {

// This class interacts with the external world, without emiting any simulation events.
// It is used for a given TX and its hinting structure assumes that the content cannot
// change during the TX.
class HintedRawContractDB final : public ContractDBInterface {
  public:
    HintedRawContractDB(const ExecutionHints& hints);

    std::optional<ContractInstance> get_contract_instance(const AztecAddress& address) const override;
    std::optional<ContractClass> get_contract_class(const ContractClassId& class_id) const override;

  private:
    FF get_bytecode_commitment(const ContractClassId& class_id) const;

    unordered_flat_map<AztecAddress, ContractInstanceHint> contract_instances;
    unordered_flat_map<ContractClassId, ContractClassHint> contract_classes;
    unordered_flat_map<ContractClassId, FF> bytecode_commitments;
};

// This class interacts with the external world, without emiting any simulation events.
class HintedRawMerkleDB final : public MerkleDBInterface {
  public:
    HintedRawMerkleDB(const ExecutionHints& hints, const TreeSnapshots& tree_roots);

    const TreeSnapshots& get_tree_roots() const override { return tree_roots; }

    crypto::merkle_tree::fr_sibling_path get_sibling_path(world_state::MerkleTreeId tree_id,
                                                          crypto::merkle_tree::index_t leaf_index) const override;

  private:
    TreeSnapshots tree_roots;

    using GetSiblingPathKey =
        utils::HashableTuple<AppendOnlyTreeSnapshot, world_state::MerkleTreeId, crypto::merkle_tree::index_t>;
    unordered_flat_map<GetSiblingPathKey, crypto::merkle_tree::fr_sibling_path> get_sibling_path_hints;

    const AppendOnlyTreeSnapshot& get_tree_info(world_state::MerkleTreeId tree_id) const;
};

} // namespace bb::avm2::simulation
