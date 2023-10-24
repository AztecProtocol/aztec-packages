
#pragma once
#include "barretenberg/proof_system/arithmetization/arithmetization.hpp"
namespace arithmetization {
class BrilligVMArithmetization : public Arithmetization<88, 0> {
  public:
    using FF = barretenberg::fr;
    struct Selectors {};
};
} // namespace arithmetization
