#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/simulation/lib/db_interfaces.hpp"

namespace bb::avm2::simulation {

// This class interacts with the external world, without emiting any simulation events.
class HintedRawContractDB final : public ContractDBInterface {
  public:
    HintedRawContractDB(const ExecutionHints& hints);

    ContractInstance get_contract_instance(const AztecAddress& address) const override;
    ContractClass get_contract_class(const ContractClassId& class_id) const override;

  private:
    std::vector<ContractInstanceHint> contract_instances;
    std::vector<ContractClassHint> contract_classes;
    mutable size_t contract_instances_idx = 0;
    mutable size_t contract_classes_idx = 0;
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
