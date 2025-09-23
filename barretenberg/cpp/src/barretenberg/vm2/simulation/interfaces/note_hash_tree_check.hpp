#pragma once

#include <span>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

class NoteHashTreeCheckInterface {
  public:
    virtual ~NoteHashTreeCheckInterface() = default;

    virtual bool note_hash_exists(const FF& unique_note_hash,
                                  const FF& leaf_value,
                                  uint64_t leaf_index,
                                  std::span<const FF> sibling_path,
                                  const AppendOnlyTreeSnapshot& snapshot) = 0;
    virtual FF get_first_nullifier() const = 0;
    virtual AppendOnlyTreeSnapshot append_note_hash(const FF& note_hash,
                                                    AztecAddress contract_address,
                                                    uint64_t note_hash_counter,
                                                    std::span<const FF> sibling_path,
                                                    const AppendOnlyTreeSnapshot& prev_snapshot) = 0;
    virtual AppendOnlyTreeSnapshot append_siloed_note_hash(const FF& siloed_note_hash,
                                                           uint64_t note_hash_counter,
                                                           std::span<const FF> sibling_path,
                                                           const AppendOnlyTreeSnapshot& prev_snapshot) = 0;
    virtual AppendOnlyTreeSnapshot append_unique_note_hash(const FF& unique_note_hash,
                                                           uint64_t note_hash_counter,
                                                           std::span<const FF> sibling_path,
                                                           const AppendOnlyTreeSnapshot& prev_snapshot) = 0;
};

} // namespace bb::avm2::simulation
