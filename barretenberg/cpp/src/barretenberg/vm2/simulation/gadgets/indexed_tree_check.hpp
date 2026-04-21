#pragma once

#include "barretenberg/vm2/common/field.hpp"
#include "barretenberg/vm2/simulation/events/event_emitter.hpp"
#include "barretenberg/vm2/simulation/events/indexed_tree_check_event.hpp"
#include "barretenberg/vm2/simulation/interfaces/db.hpp"
#include "barretenberg/vm2/simulation/interfaces/field_gt.hpp"
#include "barretenberg/vm2/simulation/interfaces/indexed_tree_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/merkle_check.hpp"
#include "barretenberg/vm2/simulation/interfaces/poseidon2.hpp"
#include "barretenberg/vm2/simulation/lib/db_types.hpp"

#include <cstdint>
#include <optional>
#include <span>

namespace bb::avm2::simulation {

class IndexedTreeCheck : public IndexedTreeCheckInterface, public CheckpointNotifiable {
  public:
    IndexedTreeCheck(Poseidon2Interface& poseidon2,
                     MerkleCheckInterface& merkle_check,
                     FieldGreaterThanInterface& field_gt,
                     uint64_t merkle_hash_domain_separator,
                     EventEmitterInterface<IndexedTreeCheckEvent>& event_emitter)
        : events(event_emitter)
        , poseidon2(poseidon2)
        , merkle_check(merkle_check)
        , field_gt(field_gt)
        , merkle_hash_domain_separator(merkle_hash_domain_separator)
    {}

    void assert_read(const FF& value,
                     std::optional<IndexedTreeSiloingParameters> siloing_params,
                     bool exists,
                     const IndexedTreeLeafData& low_leaf_preimage,
                     uint64_t low_leaf_index,
                     std::span<const FF> sibling_path,
                     const AppendOnlyTreeSnapshot& snapshot) override;
    AppendOnlyTreeSnapshot write(const FF& value,
                                 std::optional<IndexedTreeSiloingParameters> siloing_params,
                                 std::optional<uint64_t> public_inputs_index,
                                 const IndexedTreeLeafData& low_leaf_preimage,
                                 uint64_t low_leaf_index,
                                 std::span<const FF> low_leaf_sibling_path,
                                 const AppendOnlyTreeSnapshot& prev_snapshot,
                                 std::optional<std::span<const FF>> insertion_sibling_path) override;

    void on_checkpoint_created() override;
    void on_checkpoint_committed() override;
    void on_checkpoint_reverted() override;

  private:
    FF silo(const FF& nullifier, IndexedTreeSiloingParameters siloing_params);
    void validate_low_leaf(const FF& value, const IndexedTreeLeafData& low_leaf_preimage, bool exists);

    EventEmitterInterface<IndexedTreeCheckEvent>& events;
    Poseidon2Interface& poseidon2;
    MerkleCheckInterface& merkle_check;
    FieldGreaterThanInterface& field_gt;
    uint64_t merkle_hash_domain_separator;
};

} // namespace bb::avm2::simulation
