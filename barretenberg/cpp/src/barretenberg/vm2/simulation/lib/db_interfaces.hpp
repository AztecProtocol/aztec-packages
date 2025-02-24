#pragma once

#include "barretenberg/vm2/common/avm_inputs.hpp"
#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class ContractDBInterface {
  public:
    virtual ~ContractDBInterface() = default;

    virtual ContractInstance get_contract_instance(const AztecAddress& address) const = 0;
    virtual ContractClass get_contract_class(const ContractClassId& class_id) const = 0;
};

class MerkleDBInterface {
  public:
    virtual ~MerkleDBInterface() = default;

    virtual const TreeRoots& get_tree_roots() const = 0;
};

} // namespace bb::avm2::simulation
