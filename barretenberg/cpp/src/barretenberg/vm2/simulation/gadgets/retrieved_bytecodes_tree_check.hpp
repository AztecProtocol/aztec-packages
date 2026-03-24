#pragma once

#include <cstdint>
#include <utility>

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/interfaces/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/retrieved_bytecodes_tree_check.hpp"
#include "barretenberg/vm2/simulation/lib/retrieved_bytecodes_tree.hpp"

namespace bb::avm2::simulation {

class RetrievedBytecodesTreeCheck : public RetrievedBytecodesTreeCheckInterface {
  public:
    RetrievedBytecodesTreeCheck(IndexedTreeCheckInterface& indexed_tree_check, RetrievedBytecodesTree initial_state)
        : indexed_tree_check(indexed_tree_check)
        , tree(std::move(initial_state))
    {}

    bool contains(const FF& class_id) override;

    void insert(const FF& class_id) override;

    AppendOnlyTreeSnapshot get_snapshot() const override;

    uint32_t size() const override;

  private:
    IndexedTreeCheckInterface& indexed_tree_check;

    RetrievedBytecodesTree tree;
};

} // namespace bb::avm2::simulation
