#pragma once

#include <cstdint>

#include "barretenberg/vm2/common/aztec_types.hpp"
#include "barretenberg/vm2/common/field.hpp"

namespace bb::avm2::simulation {

FF root_from_path(const FF& leaf_value, const uint64_t leaf_index, std::span<const FF> path);

FF silo_note_hash(const AztecAddress& contract_address, const FF& note_hash);

FF make_unique_note_hash(const FF& siloed_note_hash, const FF& first_nullifier, uint64_t note_hash_counter);

} // namespace bb::avm2::simulation
