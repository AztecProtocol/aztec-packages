#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

// This class interacts with the external world, without emiting any simulation events.
class RawDataDBInterface {
  public:
    virtual ~RawDataDBInterface() = default;

    virtual ContractInstance get_contract_instance(const AztecAddress& address) const = 0;
    virtual ContractClass get_contract_class(const ContractClassId& class_id) const = 0;
    virtual const TreeRoots& get_tree_roots() const = 0;
};

class HintedRawDataDB : public RawDataDBInterface {
  public:
    HintedRawDataDB(const ExecutionHints& hints);

    ContractInstance get_contract_instance(const AztecAddress& address) const override;
    ContractClass get_contract_class(const ContractClassId& class_id) const override;
    const TreeRoots& get_tree_roots() const override { return tree_roots; }

  private:
    std::vector<ContractInstanceHint> contract_instances;
    std::vector<ContractClassHint> contract_classes;
    TreeRoots tree_roots;
    mutable size_t contract_instances_idx = 0;
    mutable size_t contract_classes_idx = 0;
};

} // namespace bb::avm2::simulation
