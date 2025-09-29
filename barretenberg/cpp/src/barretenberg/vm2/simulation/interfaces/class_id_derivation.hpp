#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class ClassIdDerivationInterface {
  public:
    virtual ~ClassIdDerivationInterface() = default;
    virtual void assert_derivation(const ContractClassId& class_id, const ContractClass& klass) = 0;
};

} // namespace bb::avm2::simulation
