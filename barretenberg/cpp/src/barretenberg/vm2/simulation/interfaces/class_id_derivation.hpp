#pragma once

#include "barretenberg/vm2/common/aztec_types.hpp"

namespace bb::avm2::simulation {

class ClassIdDerivationInterface {
  public:
    virtual ~ClassIdDerivationInterface() = default;
    virtual void assert_derivation(const ContractClassWithCommitment& klass) = 0;
};

} // namespace bb::avm2::simulation
