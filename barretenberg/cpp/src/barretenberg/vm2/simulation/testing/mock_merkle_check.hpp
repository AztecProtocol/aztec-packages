#pragma once

#include <gmock/gmock.h>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/merkle_check.hpp"

namespace bb::avm2::simulation {

class MockMerkleCheck : public MerkleCheckInterface {
  public:
    MockMerkleCheck();
    ~MockMerkleCheck() override;

    MOCK_METHOD(void,
                assert_membership,
                (const FF& leaf_value, const uint64_t leaf_index, std::span<const FF> sibling_path, const FF& root),
                (override));
    MOCK_METHOD(FF,
                write,
                (const FF& current_value,
                 const FF& new_value,
                 const uint64_t leaf_index,
                 std::span<const FF> sibling_path,
                 const FF& current_root),
                (override));
};

} // namespace bb::avm2::simulation
