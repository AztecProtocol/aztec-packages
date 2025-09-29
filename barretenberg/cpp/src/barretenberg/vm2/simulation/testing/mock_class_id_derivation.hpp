#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/simulation/interfaces/class_id_derivation.hpp"

namespace bb::avm2::simulation {

class MockClassIdDerivation : public ClassIdDerivationInterface {
  public:
    // https://google.github.io/googletest/gmock_cook_book.html#making-the-compilation-faster
    MockClassIdDerivation();
    ~MockClassIdDerivation() override;

    MOCK_METHOD(void, assert_derivation, (const ContractClassId& class_id, const ContractClass& klass), (override));
};

} // namespace bb::avm2::simulation
