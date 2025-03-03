#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/map.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

// This class interacts with the external world, without emiting any simulation events.
// It is used for a given TX and its hinting structure assumes that the content cannot
// change during the TX.
class HintedRawContractDB final : public ContractDBInterface {
  public:
    HintedRawContractDB(const ExecutionHints& hints);

    ContractInstance get_contract_instance(const AztecAddress& address) const override;
    ContractClass get_contract_class(const ContractClassId& class_id) const override;

  private:
    unordered_flat_map<AztecAddress, ContractInstanceHint> contract_instances;
    unordered_flat_map<AztecAddress, ContractClassHint> contract_classes;
};

// This class interacts with the external world, without emiting any simulation events.
class HintedRawMerkleDB final : public MerkleDBInterface {
  public:
    HintedRawMerkleDB(const ExecutionHints& hints);

    const TreeRoots& get_tree_roots() const override { return tree_roots; }

  private:
    TreeRoots tree_roots;
};

} // namespace bb::avm2::simulation
